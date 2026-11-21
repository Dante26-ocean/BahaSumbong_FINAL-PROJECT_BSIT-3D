
import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  signal
} from '@angular/core';

import { DatePipe } from '@angular/common';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// STEP 106.2.4 - CENTRALIZED BACKEND API
// =========================================

import {
  buildBackendApiUrl
} from '../../../config/backend-api.config';

// =========================================
// REPORT STATUS AND READINESS
// =========================================

type ReportStatus =
  | 'in_progress'
  | 'resolved'
  | 'rejected';

type ReviewReadiness =
  | 'ready'
  | 'needs_photos'
  | 'unclassified'
  | 'invalid_photos'
  | 'legacy_exempt';

// =========================================
// COMMUNITY REPORT STRUCTURE
// =========================================

interface CommunityReport {
  id: string;
  residentId: string;
  problemType: string;
  description: string;
  locationDescription: string;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;

  photoCount: number;
  photoFingerprint: string;
  reviewReadiness: ReviewReadiness;
}

// =========================================
// PROTECTED PHOTO STRUCTURE
// =========================================

interface ProtectedPhoto {
  index: number;
  url: string;
}

@Component({
  selector: 'app-reports',
  imports: [DatePipe, RouterLink],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports implements OnInit, OnDestroy {

  // =========================================
  // REPORT STATES
  // =========================================

  readonly reports = signal<CommunityReport[]>([]);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  // =========================================
  // STEP 100.2 - SELECTED REPORT NAVIGATION
  // =========================================

  readonly focusedReportId =
    signal<string | null>(null);

  readonly displayedReports = computed(() => {

    const requestedId = this.focusedReportId();

    if (!requestedId) {
      return this.reports();
    }

    return this.reports().filter(
      report => report.id === requestedId
    );

  });

  // =========================================
  // REPORT READINESS STATISTICS
  // =========================================

  readonly readyForReviewCount = computed(() =>
    this.reports().filter(
      report => this.canReview(report)
    ).length
  );

  readonly needsAttentionCount = computed(() =>
    this.reports().filter(
      report => !this.canReview(report)
    ).length
  );

  // =========================================
  // STATUS UPDATE STATES
  // =========================================

  readonly updatingReportId =
    signal<string | null>(null);

  readonly statusSuccess = signal('');
  readonly statusError = signal('');

  // =========================================
  // PROTECTED PHOTO STATES
  // =========================================

  readonly selectedReportId =
    signal<string | null>(null);

  readonly photoUrls =
    signal<ProtectedPhoto[]>([]);

  readonly isLoadingPhotos = signal(false);
  readonly photoError = signal('');

  private selectedPhotoFingerprint: string | null =
    null;

  private photoAbortController:
    AbortController | null = null;

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeReports: Unsubscribe | null =
    null;

  private unsubscribeRoute: {
    unsubscribe(): void;
  } | null = null;

  private destroyed = false;

  constructor(
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {

    // =====================================
    // READ OPTIONAL REPORT ID FROM URL
    // =====================================

    this.unsubscribeRoute =
      this.route.queryParamMap.subscribe(params => {

        const reportId = params.get('reportId');

        const validReportId =
          reportId &&
          /^[A-Za-z0-9_-]{1,128}$/.test(reportId)
            ? reportId
            : null;

        // Stop any photo viewer associated
        // with the previous selection.
        this.clearSelectedReportPhotos();

        this.focusedReportId.set(validReportId);

        this.statusSuccess.set('');
        this.statusError.set('');

      });

    void this.loadAllReports();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    this.unsubscribeRoute?.unsubscribe();
    this.unsubscribeRoute = null;

    this.unsubscribeReports?.();
    this.unsubscribeReports = null;

    this.releasePhotoResources();
  }

  // =========================================
  // VALIDATE PROTECTED PHOTO REFERENCES
  // =========================================

  private hasValidPhotoReferences(
    data: Record<string, unknown>
  ): boolean {

    const photos = data['reportPhotos'];

    if (
      !Array.isArray(photos) ||
      photos.length < 1 ||
      photos.length > 3
    ) {
      return false;
    }

    return photos.every(photo => {

      if (
        !photo ||
        typeof photo !== 'object'
      ) {
        return false;
      }

      const item =
        photo as Record<string, unknown>;

      return (
        typeof item['publicId'] === 'string' &&
        item['publicId'].length > 0 &&

        ['jpg', 'jpeg', 'png'].includes(
          String(item['format'])
        ) &&

        item['deliveryType'] === 'authenticated'
      );

    });
  }

  // =========================================
  // DETERMINE REPORT READINESS
  // =========================================

  private getReviewReadiness(
    data: Record<string, unknown>
  ): ReviewReadiness {

    if (this.hasValidPhotoReferences(data)) {
      return 'ready';
    }

    if (
      Object.prototype.hasOwnProperty.call(
        data,
        'reportPhotos'
      )
    ) {

      const photos = data['reportPhotos'];

      return (
        Array.isArray(photos) &&
        photos.length === 0
      )
        ? 'needs_photos'
        : 'invalid_photos';
    }

    // Future compatibility for explicitly reviewed
    // historical reports that did not require photos.
    //
    // Do not automatically exempt old reports.
    // Missing photos can also mean an interrupted upload.

    if (data['legacyPhotoExempt'] === true) {
      return 'legacy_exempt';
    }

    return 'unclassified';
  }

  // =========================================
  // CHECK IF ADMIN CAN REVIEW A REPORT
  // =========================================

  canReview(report: CommunityReport): boolean {

    return (
      report.reviewReadiness === 'ready' ||
      report.reviewReadiness === 'legacy_exempt'
    );
  }

  private canReviewDocument(
    data: Record<string, unknown>
  ): boolean {

    const readiness =
      this.getReviewReadiness(data);

    return (
      readiness === 'ready' ||
      readiness === 'legacy_exempt'
    );
  }

  // =========================================
  // LOAD ALL COMMUNITY REPORTS
  // =========================================

  private async loadAllReports(): Promise<void> {

    try {

      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in as an administrator.'
        );

        this.isLoading.set(false);
        return;
      }

      // =====================================
      // VERIFY ADMINISTRATOR PROFILE
      // =====================================

      const adminSnap = await getDocFromServer(
        doc(
          db,
          'users',
          currentUser.uid
        )
      );

      if (this.destroyed) {
        return;
      }

      if (
        !adminSnap.exists() ||
        adminSnap.data()['role'] !== 'admin' ||
        adminSnap.data()['uid'] !== currentUser.uid
      ) {

        this.errorMessage.set(
          'Administrator access is required.'
        );

        this.isLoading.set(false);
        return;
      }

      // =====================================
      // FIRESTORE REAL-TIME REPORT LISTENER
      // =====================================

      this.unsubscribeReports = onSnapshot(

        collection(db, 'reports'),

        snapshot => {

          if (this.destroyed) {
            return;
          }

          const allReports: CommunityReport[] =
            snapshot.docs.map(reportDoc => {

              const data = reportDoc.data();

              const rawPhotos =
                data['reportPhotos'];

              const photos =
                Array.isArray(rawPhotos)
                  ? rawPhotos
                  : [];

              const createdAt =
                data['createdAt'];

              const updatedAt =
                data['updatedAt'];

              return {

                id: reportDoc.id,

                residentId:
                  typeof data['residentId'] === 'string'
                    ? data['residentId']
                    : '',

                problemType:
                  typeof data['problemType'] === 'string'
                    ? data['problemType']
                    : 'unknown',

                description:
                  typeof data['description'] === 'string'
                    ? data['description']
                    : '',

                locationDescription:
                  typeof data['locationDescription'] === 'string'
                    ? data['locationDescription']
                    : '',

                status:
                  typeof data['status'] === 'string'
                    ? data['status']
                    : 'unknown',

                createdAt:
                  createdAt instanceof Timestamp
                    ? createdAt.toDate()
                    : null,

                updatedAt:
                  updatedAt instanceof Timestamp
                    ? updatedAt.toDate()
                    : null,

                photoCount: photos.length,

                photoFingerprint:
                  JSON.stringify(photos),

                reviewReadiness:
                  this.getReviewReadiness(data)

              };

            });

          // Sort newest first.
          allReports.sort((a, b) => {

            const dateA =
              a.createdAt?.getTime() ?? 0;

            const dateB =
              b.createdAt?.getTime() ?? 0;

            return dateB - dateA;

          });

          this.reports.set(allReports);

          // =================================
          // KEEP PHOTO VIEWER UPDATED
          // =================================

          const selectedId =
            this.selectedReportId();

          if (selectedId) {

            const selected =
              allReports.find(
                report => report.id === selectedId
              );

            if (!selected) {

              this.clearSelectedReportPhotos();

            } else if (
              selected.photoFingerprint !==
              this.selectedPhotoFingerprint
            ) {

              this.startProtectedPhotoLoading(
                selected
              );

            }
          }

          this.errorMessage.set('');
          this.isLoading.set(false);

        },

        error => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error loading administrator reports:',
            error
          );

          this.reports.set([]);
          this.clearSelectedReportPhotos();

          this.errorMessage.set(
            error.code === 'permission-denied'
              ? 'Permission denied. Administrator access is required.'
              : 'Unable to retrieve reports. Please check your connection.'
          );

          this.isLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing administrator reports:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to initialize administrator reports.'
        );

        this.isLoading.set(false);
      }
    }
  }

  // =========================================
  // VIEW SUPPORTING PHOTOS
  // =========================================

  viewReportPhotos(
    report: CommunityReport
  ): void {

    if (
      this.destroyed ||
      report.photoCount === 0
    ) {
      return;
    }

    this.selectedReportId.set(report.id);

    this.startProtectedPhotoLoading(report);
  }

  // =========================================
  // START PROTECTED PHOTO LOADING
  // =========================================

  private startProtectedPhotoLoading(
    report: CommunityReport
  ): void {

    this.releasePhotoResources();

    this.selectedPhotoFingerprint =
      report.photoFingerprint;

    if (report.photoCount < 1) {
      return;
    }

    if (report.photoCount > 3) {

      this.photoError.set(
        'This report contains an unsupported number of photos.'
      );

      return;
    }

    const controller =
      new AbortController();

    this.photoAbortController = controller;

    this.isLoadingPhotos.set(true);

    void this.fetchProtectedPhotos(
      report.id,
      report.photoCount,
      controller
    );
  }

  // =========================================
  // DOWNLOAD PROTECTED PHOTOS
  // =========================================

  private async fetchProtectedPhotos(
    reportId: string,
    photoCount: number,
    controller: AbortController
  ): Promise<void> {

    const loadedPhotos: ProtectedPhoto[] = [];

    try {

      await auth.authStateReady();

      const currentUser =
        auth.currentUser;

      if (!currentUser) {

        throw new Error(
          'Administrator session not found.'
        );
      }

      const token =
        await currentUser.getIdToken();

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      // Download each photo individually.
      for (
        let index = 0;
        index < photoCount;
        index++
      ) {

        // =====================================
        // STEP 106.2.4
        // CENTRALIZED BACKEND PHOTO URL
        // =====================================

        const endpoint = buildBackendApiUrl(
          '/api/reports/' +
          encodeURIComponent(reportId) +
          '/photos/' +
          index
        );

        const response = await fetch(
          endpoint,
          {
            method: 'GET',

            headers: {
              Authorization:
                `Bearer ${token}`
            },

            cache: 'no-store',
            signal: controller.signal
          }
        );

        if (!response.ok) {

          throw new Error(
            'Unable to load photo ' +
            (index + 1) +
            '. HTTP ' +
            response.status
          );
        }

        // Validate the response content type.
        const type = response.headers
          .get('content-type')
          ?.split(';')[0]
          .trim()
          .toLowerCase();

        if (
          type !== 'image/jpeg' &&
          type !== 'image/png'
        ) {

          throw new Error(
            'The backend returned an invalid image type.'
          );
        }

        const blob = await response.blob();

        if (
          controller.signal.aborted ||
          this.destroyed
        ) {
          return;
        }

        if (
          blob.size < 1 ||
          blob.size > 5 * 1024 * 1024
        ) {

          throw new Error(
            'The downloaded image has an invalid size.'
          );
        }

        loadedPhotos.push({
          index,
          url: URL.createObjectURL(blob)
        });
      }

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      this.photoUrls.set([...loadedPhotos]);

      // Component now owns the object URLs.
      loadedPhotos.length = 0;

      this.photoError.set('');

    } catch (error) {

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      console.error(
        'Administrator photo retrieval failed:',
        error
      );

      this.photoError.set(
        error instanceof Error
          ? error.message
          : 'Unable to load supporting photos.'
      );

    } finally {

      // Release URLs that were not displayed.
      for (const photo of loadedPhotos) {
        URL.revokeObjectURL(photo.url);
      }

      if (
        this.photoAbortController === controller
      ) {

        this.photoAbortController = null;

        if (!this.destroyed) {
          this.isLoadingPhotos.set(false);
        }
      }
    }
  }

  // =========================================
  // RETRY LOADING SUPPORTING PHOTOS
  // =========================================

  retryPhotoLoading(): void {

    const reportId =
      this.selectedReportId();

    if (!reportId) {
      return;
    }

    const report = this.reports().find(
      item => item.id === reportId
    );

    if (report) {
      this.startProtectedPhotoLoading(report);
    }
  }

  // =========================================
  // CLEAR PHOTO SELECTION
  // =========================================

  clearSelectedReportPhotos(): void {

    this.selectedReportId.set(null);

    this.selectedPhotoFingerprint = null;

    this.releasePhotoResources();
  }

  // =========================================
  // CLEAN UP PHOTO RESOURCES
  // =========================================

  private releasePhotoResources(): void {

    this.photoAbortController?.abort();

    this.photoAbortController = null;

    for (const photo of this.photoUrls()) {
      URL.revokeObjectURL(photo.url);
    }

    this.photoUrls.set([]);
    this.isLoadingPhotos.set(false);
    this.photoError.set('');
  }

  // =========================================
  // CHECK ALLOWED STATUS TRANSITIONS
  // =========================================

  private isAllowedTransition(
    current: string,
    next: ReportStatus
  ): boolean {

    if (current === 'pending') {

      return [
        'in_progress',
        'resolved',
        'rejected'
      ].includes(next);

    }

    if (current === 'in_progress') {

      return [
        'resolved',
        'rejected'
      ].includes(next);

    }

    return false;
  }

  // =========================================
  // UPDATE REPORT STATUS SAFELY
  // =========================================

  async updateReportStatus(
    report: CommunityReport,
    next: ReportStatus
  ): Promise<void> {

    if (this.updatingReportId() !== null) {
      return;
    }

    this.statusSuccess.set('');
    this.statusError.set('');

    // Prevent actions on incomplete or
    // unclassified reports.
    if (!this.canReview(report)) {

      this.statusError.set(
        'This report is not confirmed ready for administrator review.'
      );

      return;
    }

    // Check status transition.
    if (
      !this.isAllowedTransition(
        report.status,
        next
      )
    ) {

      this.statusError.set(
        'This report status transition is not allowed.'
      );

      return;
    }

    // Confirm final decisions.
    if (
      next === 'resolved' ||
      next === 'rejected'
    ) {

      const confirmed = window.confirm(
        'Mark this report as ' +
        next.replace('_', ' ') +
        '? This is a final decision.'
      );

      if (!confirmed) {
        return;
      }
    }

    this.updatingReportId.set(report.id);

    try {

      await auth.authStateReady();

      if (!auth.currentUser) {

        throw new Error(
          'Administrator session not found.'
        );
      }

      const reportRef = doc(
        db,
        'reports',
        report.id
      );

      // =====================================
      // ATOMIC READINESS AND STATUS CHECK
      // =====================================

      await runTransaction(
        db,
        async transaction => {

          const snap =
            await transaction.get(reportRef);

          if (!snap.exists()) {

            throw new Error(
              'REPORT_NOT_FOUND'
            );
          }

          const latest = snap.data();

          // Recheck the latest Firestore data.
          if (!this.canReviewDocument(latest)) {

            throw new Error(
              'REPORT_NOT_READY'
            );
          }

          if (
            !this.isAllowedTransition(
              latest['status'],
              next
            )
          ) {

            throw new Error(
              'STATUS_CHANGED'
            );
          }

          // Update only the administrator-
          // controlled report fields.
          transaction.update(reportRef, {

            status: next,

            updatedAt:
              serverTimestamp()

          });

        }
      );

      if (!this.destroyed) {

        this.statusSuccess.set(
          'Report ' +
          report.id +
          ' updated to ' +
          next.replace('_', ' ') +
          '.'
        );
      }

    } catch (error: unknown) {

      console.error(
        'Error updating report status:',
        error
      );

      if (this.destroyed) {
        return;
      }

      const code =
        (error as { code?: string })?.code;

      const message =
        error instanceof Error
          ? error.message
          : '';

      if (message === 'REPORT_NOT_READY') {

        this.statusError.set(
          'This report is still missing confirmed photos or a verified legacy exemption.'
        );

      } else if (message === 'STATUS_CHANGED') {

        this.statusError.set(
          'This report status changed. Please review the latest status.'
        );

      } else if (message === 'REPORT_NOT_FOUND') {

        this.statusError.set(
          'This report no longer exists.'
        );

      } else if (code === 'permission-denied') {

        this.statusError.set(
          'Permission denied. Administrator access or a valid status transition is required.'
        );

      } else {

        this.statusError.set(
          'Unable to update report status. Please try again.'
        );
      }

    } finally {

      if (!this.destroyed) {
        this.updatingReportId.set(null);
      }
    }
  }
}
