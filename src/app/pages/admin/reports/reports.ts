
import {
  Component,
  OnInit,
  OnDestroy,
  signal
} from '@angular/core';

import { DatePipe } from '@angular/common';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// REPORT STATUS
// =========================================

type ReportStatus =
  | 'in_progress'
  | 'resolved'
  | 'rejected';

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

  // Supporting photos
  photoCount: number;
  photoFingerprint: string;
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
  imports: [DatePipe],
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
  // STATUS UPDATE STATES
  // =========================================

  readonly updatingReportId =
    signal<string | null>(null);

  readonly statusSuccess = signal('');
  readonly statusError = signal('');

  // =========================================
  // SUPPORTING PHOTO STATES
  // =========================================

  readonly selectedReportId =
    signal<string | null>(null);

  readonly photoUrls =
    signal<ProtectedPhoto[]>([]);

  readonly isLoadingPhotos = signal(false);
  readonly photoError = signal('');

  // Detect changes to supporting photos.
  private selectedPhotoFingerprint: string | null =
    null;

  // Cancel old photo requests.
  private photoAbortController:
    AbortController | null = null;

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeReports: Unsubscribe | null =
    null;

  private destroyed = false;

  ngOnInit(): void {
    void this.loadAllReports();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    this.unsubscribeReports?.();
    this.unsubscribeReports = null;

    // Release protected image resources.
    this.releasePhotoResources();

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
      // VERIFY ADMINISTRATOR
      // =====================================

      const adminRef = doc(
        db,
        'users',
        currentUser.uid
      );

      const adminSnap =
        await getDocFromServer(adminRef);

      if (this.destroyed) {
        return;
      }

      if (!adminSnap.exists()) {

        this.errorMessage.set(
          'Administrator account not found.'
        );

        this.isLoading.set(false);
        return;

      }

      const adminData = adminSnap.data();

      if (
        adminData['role'] !== 'admin' ||
        adminData['uid'] !== currentUser.uid
      ) {

        this.errorMessage.set(
          'You do not have permission to view all reports.'
        );

        this.isLoading.set(false);
        return;

      }

      // =====================================
      // LOAD FIRESTORE REPORTS
      // =====================================

      const reportsRef = collection(
        db,
        'reports'
      );

      this.unsubscribeReports = onSnapshot(

        reportsRef,

        (snapshot) => {

          if (this.destroyed) {
            return;
          }

          const allReports: CommunityReport[] =
            snapshot.docs.map((reportDoc) => {

              const data = reportDoc.data();

              const createdAt = data['createdAt'];
              const updatedAt = data['updatedAt'];

              // Extract supporting photo metadata.
              const photoReferences =
                Array.isArray(data['reportPhotos'])
                  ? data['reportPhotos']
                  : [];

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

                // Number of attached photos.
                photoCount: photoReferences.length,

                // Identify changes to photo references.
                photoFingerprint:
                  JSON.stringify(photoReferences)

              };

            });

          // =====================================
          // SORT NEWEST TO OLDEST
          // =====================================

          allReports.sort((a, b) => {

            const dateA =
              a.createdAt?.getTime() ?? 0;

            const dateB =
              b.createdAt?.getTime() ?? 0;

            return dateB - dateA;

          });

          this.reports.set(allReports);

          // =====================================
          // KEEP SELECTED PHOTOS UPDATED
          // =====================================

          const selectedId =
            this.selectedReportId();

          if (selectedId) {

            const selectedReport =
              allReports.find(
                report => report.id === selectedId
              );

            if (!selectedReport) {

              this.clearSelectedReportPhotos();

            } else if (
              selectedReport.photoFingerprint !==
              this.selectedPhotoFingerprint
            ) {

              this.startProtectedPhotoLoading(
                selectedReport
              );

            }

          }

          this.errorMessage.set('');
          this.isLoading.set(false);

        },

        (error) => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error loading administrator reports:',
            error
          );

          this.reports.set([]);
          this.clearSelectedReportPhotos();

          if (error.code === 'permission-denied') {

            this.errorMessage.set(
              'Permission denied. Administrator access is required.'
            );

          } else {

            this.errorMessage.set(
              'Unable to retrieve community reports. ' +
              'Please check your connection.'
            );

          }

          this.isLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing Admin Reports:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Something went wrong while loading community reports.'
        );

        this.isLoading.set(false);

      }

    }

  }

  // =========================================
  // SELECT REPORT SUPPORTING PHOTOS
  // =========================================

  viewReportPhotos(report: CommunityReport): void {

    if (this.destroyed) {
      return;
    }

    this.selectedReportId.set(report.id);

    // Load only the selected report's photos.
    this.startProtectedPhotoLoading(report);

  }

  // =========================================
  // START PROTECTED PHOTO LOADING
  // =========================================

  private startProtectedPhotoLoading(
    report: CommunityReport
  ): void {

    // Cancel previous downloads and clear images.
    this.releasePhotoResources();

    this.selectedPhotoFingerprint =
      report.photoFingerprint;

    if (report.photoCount === 0) {
      return;
    }

    // The backend supports up to 3 photos.
    if (report.photoCount > 3) {

      this.photoError.set(
        'This report contains an unsupported number of photos.'
      );

      return;

    }

    const controller = new AbortController();

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

      const currentUser = auth.currentUser;

      if (!currentUser) {

        throw new Error(
          'Administrator session not found.'
        );

      }

      // Obtain Firebase ID token.
      const firebaseToken =
        await currentUser.getIdToken();

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      // =====================================
      // DOWNLOAD EACH SUPPORTING PHOTO
      // =====================================

      for (
        let index = 0;
        index < photoCount;
        index++
      ) {

        const endpoint =
          'http://127.0.0.1:3000/api/reports/' +
          encodeURIComponent(reportId) +
          '/photos/' +
          index;

        const response = await fetch(
          endpoint,
          {
            method: 'GET',

            headers: {
              Authorization:
                `Bearer ${firebaseToken}`
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

        // =====================================
        // VALIDATE RESPONSE CONTENT TYPE
        // =====================================

        const contentType =
          response.headers
            .get('content-type')
            ?.split(';')[0]
            .trim()
            .toLowerCase();

        if (
          contentType !== 'image/jpeg' &&
          contentType !== 'image/png'
        ) {

          throw new Error(
            'The backend returned an invalid image type.'
          );

        }

        // Convert response to image Blob.
        const imageBlob =
          await response.blob();

        if (
          controller.signal.aborted ||
          this.destroyed
        ) {
          return;
        }

        if (
          imageBlob.size === 0 ||
          imageBlob.size > 5 * 1024 * 1024
        ) {

          throw new Error(
            'The downloaded image has an invalid size.'
          );

        }

        // Create temporary local browser URL.
        const imageUrl =
          URL.createObjectURL(imageBlob);

        loadedPhotos.push({
          index,
          url: imageUrl
        });

      }

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      // All photos successfully downloaded.
      this.photoUrls.set([...loadedPhotos]);

      // URLs are now owned by component state.
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
  // RETRY PHOTO LOADING
  // =========================================

  retryPhotoLoading(): void {

    const reportId = this.selectedReportId();

    if (!reportId) {
      return;
    }

    const report = this.reports().find(
      item => item.id === reportId
    );

    if (!report) {
      return;
    }

    this.startProtectedPhotoLoading(report);

  }

  // =========================================
  // CLEAR SELECTED REPORT PHOTOS
  // =========================================

  clearSelectedReportPhotos(): void {

    this.selectedReportId.set(null);
    this.selectedPhotoFingerprint = null;

    this.releasePhotoResources();

  }

  // =========================================
  // CLEAN UP PROTECTED IMAGE RESOURCES
  // =========================================

  private releasePhotoResources(): void {

    // Cancel active photo downloads.
    this.photoAbortController?.abort();
    this.photoAbortController = null;

    // Release previously displayed image URLs.
    for (const photo of this.photoUrls()) {
      URL.revokeObjectURL(photo.url);
    }

    this.photoUrls.set([]);
    this.isLoadingPhotos.set(false);
    this.photoError.set('');

  }

  // =========================================
  // STATUS TRANSITION VALIDATION
  // =========================================

  private isAllowedTransition(
    currentStatus: string,
    newStatus: ReportStatus
  ): boolean {

    if (currentStatus === 'pending') {

      return [
        'in_progress',
        'resolved',
        'rejected'
      ].includes(newStatus);

    }

    if (currentStatus === 'in_progress') {

      return [
        'resolved',
        'rejected'
      ].includes(newStatus);

    }

    return false;

  }

  // =========================================
  // ADMINISTRATOR STATUS UPDATE
  // =========================================

  async updateReportStatus(
    report: CommunityReport,
    newStatus: ReportStatus
  ): Promise<void> {

    // Prevent multiple simultaneous updates.
    if (this.updatingReportId() !== null) {
      return;
    }

    this.statusSuccess.set('');
    this.statusError.set('');

    // Check the allowed transition.
    if (
      !this.isAllowedTransition(
        report.status,
        newStatus
      )
    ) {

      this.statusError.set(
        'This report status transition is not allowed.'
      );

      return;
    }

    // Confirmation for final decisions.
    if (
      newStatus === 'resolved' ||
      newStatus === 'rejected'
    ) {

      const confirmed = window.confirm(
        'Are you sure you want to mark this report as ' +
        newStatus.replace('_', ' ') +
        '? This is a final decision.'
      );

      if (!confirmed) {
        return;
      }

    }

    this.updatingReportId.set(report.id);

    try {

      await auth.authStateReady();

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.statusError.set(
          'Administrator session not found. Please sign in.'
        );

        return;
      }

      // Reference existing Firestore report.
      const reportRef = doc(
        db,
        'reports',
        report.id
      );

      // Update only administrator-controlled fields.
      await updateDoc(reportRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      if (this.destroyed) {
        return;
      }

      this.statusSuccess.set(
        'Report ' + report.id +
        ' successfully updated to ' +
        newStatus.replace('_', ' ') + '.'
      );

    } catch (error: unknown) {

      console.error(
        'Error updating report status:',
        error
      );

      if (this.destroyed) {
        return;
      }

      const firebaseError = error as {
        code?: string;
      };

      if (
        firebaseError.code === 'permission-denied'
      ) {

        this.statusError.set(
          'Permission denied. The administrator ' +
          'does not have permission to make this change, ' +
          'or the status transition is no longer valid.'
        );

      } else {

        this.statusError.set(
          'Unable to update the report status. ' +
          'Please try again.'
        );

      }

    } finally {

      if (!this.destroyed) {
        this.updatingReportId.set(null);
      }

    }

  }

}
