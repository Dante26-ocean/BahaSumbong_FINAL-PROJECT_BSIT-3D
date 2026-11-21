
import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  inject
} from '@angular/core';

import {
  FormsModule,
  NgForm
} from '@angular/forms';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  collection,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';
import { buildBackendApiUrl } from '../../../config/backend-api.config';

type ReportStep = 1 | 2 | 3 | 4;

interface PendingSubmission {
  version: 1;
  uid: string;
  reportId: string;
  latitude: number;
  longitude: number;
  problemType: string;
  description: string;
}

@Component({
  selector: 'app-create-report',
  imports: [FormsModule, RouterLink],
  templateUrl: './create-report.html',
  styleUrl: './create-report.css',
})
export class CreateReport implements OnInit {

  private readonly route = inject(ActivatedRoute);

  @ViewChild('photoInput')
  photoInput?: ElementRef<HTMLInputElement>;

  // =========================================
  // FOUR-STEP WORKFLOW
  // =========================================

  currentStep: ReportStep = 1;
  readonly totalSteps = 4;

  latitude: number | null = null;
  longitude: number | null = null;

  problemType = '';
  description = '';

  private readonly allowedProblemTypes = [
    'flooding',
    'blocked_drainage',
    'damaged_drainage'
  ];

  get hasSelectedLocation(): boolean {
    return (
      this.latitude !== null &&
      this.longitude !== null &&
      Number.isFinite(this.latitude) &&
      Number.isFinite(this.longitude) &&
      this.latitude >= -90 &&
      this.latitude <= 90 &&
      this.longitude >= -180 &&
      this.longitude <= 180
    );
  }

  // =========================================
  // SUPPORTING PHOTOS
  // =========================================

  readonly maxPhotos = 3;
  readonly maxPhotoBytes = 3 * 1024 * 1024;

  selectedPhotos: File[] = [];

  // =========================================
  // SUBMISSION STATES
  // =========================================

  isSubmitting = false;
  submissionComplete = false;

  errorMessage = '';
  successMessage = '';

  // Non-null only when the Firestore document
  // has been confirmed to exist.
  createdReportId: string | null = null;

  completedReportId: string | null = null;

  // =========================================
  // RECOVERY STATES
  // =========================================

  // A reserved ID may not have a document yet.
  private pendingReportId: string | null = null;
  private pendingUserId: string | null = null;

  private isRestoring = true;
  private recoveryBlocked = false;

  private readonly storagePrefix =
    'bahasumbong:pending-report:';

  ngOnInit(): void {
    this.loadMapCoordinates();
    void this.restorePendingSubmission();
  }

  // =========================================
  // LOAD MAP COORDINATES
  // =========================================

  private loadMapCoordinates(): void {

    const latParam =
      this.route.snapshot.queryParamMap.get(
        'latitude'
      );

    const lngParam =
      this.route.snapshot.queryParamMap.get(
        'longitude'
      );

    if (
      latParam === null ||
      lngParam === null
    ) {
      return;
    }

    if (
      latParam.trim() === '' ||
      lngParam.trim() === ''
    ) {
      this.errorMessage =
        'Invalid coordinates. Select a location again.';
      return;
    }

    const lat = Number(latParam);
    const lng = Number(lngParam);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      this.errorMessage =
        'Invalid coordinates. Select a location again.';
      return;
    }

    this.latitude = lat;
    this.longitude = lng;
  }

  // =========================================
  // STEP NAVIGATION
  // =========================================

  nextStep(): void {

    if (
      this.isSubmitting ||
      this.submissionComplete ||
      this.pendingReportId
    ) {
      return;
    }

    this.errorMessage = '';

    if (
      this.currentStep === 1 &&
      !this.hasSelectedLocation
    ) {
      this.errorMessage =
        'Please select a location on the map.';
      return;
    }

    if (
      this.currentStep === 2 &&
      !this.allowedProblemTypes.includes(
        this.problemType
      )
    ) {
      this.errorMessage =
        'Please select a valid problem type.';
      return;
    }

    if (this.currentStep === 3) {

      const length = this.description.trim().length;

      if (length < 10 || length > 1000) {
        this.errorMessage =
          'Description must contain 10 to 1000 characters.';
        return;
      }
    }

    if (this.currentStep < 4) {
      this.currentStep =
        (this.currentStep + 1) as ReportStep;
    }
  }

  previousStep(): void {

    if (
      this.isSubmitting ||
      this.submissionComplete ||
      this.pendingReportId
    ) {
      return;
    }

    this.errorMessage = '';

    if (this.currentStep > 1) {
      this.currentStep =
        (this.currentStep - 1) as ReportStep;
    }
  }

  // =========================================
  // PHOTO SELECTION
  // =========================================

  onPhotosSelected(event: Event): void {

    if (
      this.isSubmitting ||
      this.submissionComplete
    ) {
      return;
    }

    this.errorMessage = '';

    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    input.value = '';

    if (files.length === 0) {
      return;
    }

    for (const file of files) {

      if (
        !['image/jpeg', 'image/png'].includes(
          file.type
        )
      ) {
        this.errorMessage =
          'Only JPG and PNG photos are allowed.';
        return;
      }

      if (
        file.size === 0 ||
        file.size > this.maxPhotoBytes
      ) {
        this.errorMessage =
          'Each photo must be 3 MB or smaller.';
        return;
      }
    }

    const uniqueFiles: File[] = [];

    for (const file of files) {

      const duplicate = [
        ...this.selectedPhotos,
        ...uniqueFiles
      ].some(existing =>
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
      );

      if (!duplicate) {
        uniqueFiles.push(file);
      }
    }

    if (uniqueFiles.length === 0) {
      this.errorMessage =
        'These photos are already selected.';
      return;
    }

    if (
      this.selectedPhotos.length +
      uniqueFiles.length >
      this.maxPhotos
    ) {
      this.errorMessage =
        'You can attach a maximum of 3 photos.';
      return;
    }

    this.selectedPhotos = [
      ...this.selectedPhotos,
      ...uniqueFiles
    ];
  }

  removePhoto(index: number): void {

    if (this.isSubmitting) {
      return;
    }

    this.selectedPhotos =
      this.selectedPhotos.filter(
        (_, i) => i !== index
      );

    this.errorMessage = '';
  }

  clearSelectedPhotos(): void {

    if (this.isSubmitting) {
      return;
    }

    this.selectedPhotos = [];
    this.errorMessage = '';

    if (this.photoInput) {
      this.photoInput.nativeElement.value = '';
    }
  }

  private arePhotosValid(): boolean {

    return (
      this.selectedPhotos.length >= 1 &&
      this.selectedPhotos.length <= this.maxPhotos &&
      this.selectedPhotos.every(photo =>
        ['image/jpeg', 'image/png'].includes(
          photo.type
        ) &&
        photo.size > 0 &&
        photo.size <= this.maxPhotoBytes
      )
    );
  }

  // =========================================
  // SESSION STORAGE
  // =========================================

  private storageKey(uid: string): string {
    return this.storagePrefix + uid;
  }

  private savePendingSubmission(
    uid: string,
    reportId: string
  ): void {

    const pending: PendingSubmission = {
      version: 1,
      uid,
      reportId,
      latitude: this.latitude!,
      longitude: this.longitude!,
      problemType: this.problemType,
      description: this.description.trim()
    };

    try {
      sessionStorage.setItem(
        this.storageKey(uid),
        JSON.stringify(pending)
      );
    } catch {
      throw new Error(
        'Browser session storage is unavailable. ' +
        'The unfinished report cannot be safely remembered.'
      );
    }
  }

  private readPendingSubmission(
    uid: string
  ): PendingSubmission | null {

    const raw = sessionStorage.getItem(
      this.storageKey(uid)
    );

    if (!raw) {
      return null;
    }

    const value: unknown = JSON.parse(raw);

    if (
      !value ||
      typeof value !== 'object'
    ) {
      throw new Error('Invalid recovery record.');
    }

    const pending =
      value as Partial<PendingSubmission>;

    if (
      pending.version !== 1 ||
      pending.uid !== uid ||
      typeof pending.reportId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        pending.reportId
      ) ||
      typeof pending.latitude !== 'number' ||
      !Number.isFinite(pending.latitude) ||
      pending.latitude < -90 ||
      pending.latitude > 90 ||
      typeof pending.longitude !== 'number' ||
      !Number.isFinite(pending.longitude) ||
      pending.longitude < -180 ||
      pending.longitude > 180 ||
      typeof pending.problemType !== 'string' ||
      !this.allowedProblemTypes.includes(
        pending.problemType
      ) ||
      typeof pending.description !== 'string' ||
      pending.description.trim().length < 10 ||
      pending.description.trim().length > 1000
    ) {
      throw new Error('Invalid recovery record.');
    }

    return pending as PendingSubmission;
  }

  private clearPendingSubmission(
    uid: string
  ): void {

    try {
      sessionStorage.removeItem(
        this.storageKey(uid)
      );
    } catch (error) {
      console.warn(
        'Unable to clear recovery record:',
        error
      );
    }
  }

  // =========================================
  // FIRESTORE HELPERS
  // =========================================

  private savedPhotoCount(
    data: Record<string, unknown>
  ): number {

    const photos = data['reportPhotos'];

    return Array.isArray(photos)
      ? photos.length
      : 0;
  }

  private isPermissionDenied(
    error: unknown
  ): boolean {

    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'permission-denied'
    );
  }

  private reportDataMatches(
    data: Record<string, unknown>,
    uid: string
  ): boolean {

    return (
      data['residentId'] === uid &&
      data['problemType'] === this.problemType &&
      data['description'] === this.description.trim() &&
      data['latitude'] === this.latitude &&
      data['longitude'] === this.longitude
    );
  }

  // =========================================
  // RECOVER UNFINISHED SUBMISSION
  // =========================================

  private async restorePendingSubmission():
    Promise<void> {

    try {

      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        return;
      }

      const pending =
        this.readPendingSubmission(user.uid);

      if (!pending) {
        return;
      }

      this.pendingReportId = pending.reportId;
      this.pendingUserId = user.uid;

      this.latitude = pending.latitude;
      this.longitude = pending.longitude;

      this.problemType = pending.problemType;
      this.description = pending.description;

      this.currentStep = 4;

      const reportRef = doc(
        db,
        'reports',
        pending.reportId
      );

      try {

        const snapshot =
          await getDocFromServer(reportRef);

        if (snapshot.exists()) {

          const data = snapshot.data();

          if (!this.reportDataMatches(
            data,
            user.uid
          )) {
            throw new Error(
              'Recovered report information does not match.'
            );
          }

          // This document definitely exists.
          this.createdReportId = pending.reportId;

          const photoCount =
            this.savedPhotoCount(data);

          if (photoCount > 0) {

            this.finishSubmission(
              pending.reportId,
              photoCount,
              user.uid
            );

            return;
          }

          if (data['status'] !== 'pending') {
            throw new Error(
              'This report no longer accepts photos.'
            );
          }

          if (
            Object.prototype.hasOwnProperty.call(
              data,
              'reportPhotos'
            )
          ) {
            throw new Error(
              'This report has an incomplete photo record.'
            );
          }

          this.errorMessage =
            'An unfinished report was recovered. ' +
            'Select your photos again, then retry the upload.';

          return;
        }

        // Missing document: keep the same reserved ID.
        this.errorMessage =
          'An unfinished report ID was recovered. ' +
          'Select your photos again to continue.';

      } catch (error) {

        if (this.isPermissionDenied(error)) {

          // A nonexistent document may be unreadable
          // under our existing owner-only rules.
          //
          // Permission denied does NOT prove that
          // the document is missing.
          //
          // Keep the reserved ID. On retry, a guarded
          // create will be attempted using this ID.
          // Existing documents cannot be overwritten
          // by residents under current Firestore rules.

          this.errorMessage =
            'Your unfinished report ID was restored. ' +
            'Its Firestore creation could not be confirmed. ' +
            'Select your photos again and submit using ' +
            'the same report ID.';

          return;
        }

        throw error;
      }

    } catch (error) {

      console.error(
        'Report recovery failed:',
        error
      );

      this.recoveryBlocked = true;

      this.errorMessage =
        'Unable to verify the saved report. ' +
        'Check your connection and refresh the page.';

    } finally {
      this.isRestoring = false;
    }
  }

  // =========================================
  // CREATE OR VERIFY THE RESERVED REPORT
  // =========================================

  private async ensureReportExists(
    reportId: string,
    uid: string,
    isNewReservation: boolean,
    form: NgForm
  ): Promise<boolean> {

    const reportRef = doc(
      db,
      'reports',
      reportId
    );

    let needsCreation = isNewReservation;

    // For a new reservation, create directly.
    // Do NOT read a document that does not exist.
    if (!isNewReservation) {

      try {

        const snapshot =
          await getDocFromServer(reportRef);

        if (snapshot.exists()) {

          const data = snapshot.data();

          if (!this.reportDataMatches(data, uid)) {
            throw new Error(
              'Saved report information does not match.'
            );
          }

          this.createdReportId = reportId;

          const photoCount =
            this.savedPhotoCount(data);

          // The backend may have completed an earlier
          // upload despite a lost network response.
          if (photoCount > 0) {

            this.finishSubmission(
              reportId,
              photoCount,
              uid,
              form
            );

            return true;
          }

          if (data['status'] !== 'pending') {
            throw new Error(
              'This report no longer accepts photos.'
            );
          }

          if (
            Object.prototype.hasOwnProperty.call(
              data,
              'reportPhotos'
            )
          ) {
            throw new Error(
              'The report photo record is incomplete.'
            );
          }

          // Existing pending report without photos.
          return false;
        }

        needsCreation = true;

      } catch (error) {

        if (!this.isPermissionDenied(error)) {
          throw error;
        }

        // Owner-only Firestore rules can deny
        // reads of nonexistent documents.
        //
        // Try creating with the SAME reserved ID.
        // This is safe under the current rules:
        // resident writes cannot update or
        // overwrite an existing report.
        needsCreation = true;
      }
    }

    if (needsCreation) {

      const locationDescription =
        'Coordinates: ' +
        this.latitude!.toFixed(6) +
        ', ' +
        this.longitude!.toFixed(6);

      await setDoc(reportRef, {

        residentId: uid,

        problemType: this.problemType,
        description: this.description.trim(),

        locationDescription,

        latitude: this.latitude,
        longitude: this.longitude,

        status: 'pending',
        createdAt: serverTimestamp()

      });

      // setDoc succeeded: the document now exists.
      this.createdReportId = reportId;
    }

    return false;
  }

  // =========================================
  // BACKEND PHOTO UPLOAD
  // =========================================

  private async uploadReportPhotos(
    reportId: string,
    firebaseToken: string
  ): Promise<void> {

    const formData = new FormData();

    for (const photo of this.selectedPhotos) {
      formData.append(
        'photos',
        photo,
        photo.name
      );
    }

    const response = await fetch(
      buildBackendApiUrl(
        '/api/reports/' +
        encodeURIComponent(reportId) +
        '/photos'
      ),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        },
        body: formData
      }
    );

    let responseData: {
      message?: string;
    } = {};

    try {
      responseData = await response.json();
    } catch {
      // Handle unexpected response content.
    }

    if (!response.ok) {
      throw new Error(
        responseData.message ||
        `Photo upload failed. HTTP ${response.status}`
      );
    }
  }

  // =========================================
  // SUCCESS HANDLER
  // =========================================

  private finishSubmission(
    reportId: string,
    photoCount: number,
    uid: string,
    form?: NgForm
  ): void {

    this.completedReportId = reportId;
    this.submissionComplete = true;

    this.successMessage =
      'Your community report and ' +
      photoCount +
      ' supporting photo(s) were submitted successfully.';

    this.errorMessage = '';

    this.clearPendingSubmission(uid);

    this.pendingReportId = null;
    this.pendingUserId = null;

    this.createdReportId = null;

    form?.resetForm();

    this.problemType = '';
    this.description = '';
    this.selectedPhotos = [];

    if (this.photoInput) {
      this.photoInput.nativeElement.value = '';
    }
  }

  // =========================================
  // SUBMIT OR RETRY REPORT
  // =========================================

  async submitReport(form: NgForm): Promise<void> {

    if (
      this.isSubmitting ||
      this.submissionComplete
    ) {
      return;
    }

    if (
      this.isRestoring ||
      this.recoveryBlocked
    ) {
      this.errorMessage =
        'Report recovery has not completed. ' +
        'Check your connection and refresh the page.';
      return;
    }

    if (this.currentStep !== 4) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.hasSelectedLocation) {
      this.errorMessage =
        'Please select a valid map location.';
      return;
    }

    if (
      !this.allowedProblemTypes.includes(
        this.problemType
      )
    ) {
      this.errorMessage =
        'Please select a valid problem type.';
      return;
    }

    const description = this.description.trim();

    if (
      description.length < 10 ||
      description.length > 1000
    ) {
      this.errorMessage =
        'Description must contain 10 to 1000 characters.';
      return;
    }

    if (!this.arePhotosValid()) {
      this.errorMessage =
        'Select 1 to 3 JPG or PNG photos, ' +
        'maximum 3 MB each.';
      return;
    }

    this.isSubmitting = true;

    try {

      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        throw new Error(
          'Please sign in before submitting.'
        );
      }

      const uid = user.uid;

      if (
        this.pendingUserId &&
        this.pendingUserId !== uid
      ) {
        throw new Error(
          'This unfinished report belongs to another account.'
        );
      }

      // =====================================
      // RESERVE AN ID ONLY ONCE
      // =====================================

      const isNewReservation =
        this.pendingReportId === null;

      if (isNewReservation) {

        const reservedRef = doc(
          collection(db, 'reports')
        );

        // Save recovery information BEFORE
        // the Firestore network write.
        this.savePendingSubmission(
          uid,
          reservedRef.id
        );

        this.pendingReportId = reservedRef.id;
        this.pendingUserId = uid;
      }

      const reportId = this.pendingReportId!;

      // =====================================
      // CREATE OR REUSE THE SAME DOCUMENT
      // =====================================

      const alreadyComplete =
        await this.ensureReportExists(
          reportId,
          uid,
          isNewReservation,
          form
        );

      if (alreadyComplete) {
        return;
      }

      // =====================================
      // UPLOAD PHOTOS THROUGH NODE.JS
      // =====================================

      const token = await user.getIdToken();

      try {

        await this.uploadReportPhotos(
          reportId,
          token
        );

      } catch (uploadError) {

        // Check whether the backend actually
        // saved photos before the response failed.
        try {

          const latest =
            await getDocFromServer(
              doc(db, 'reports', reportId)
            );

          if (
            latest.exists() &&
            this.reportDataMatches(
              latest.data(),
              uid
            )
          ) {

            const savedCount =
              this.savedPhotoCount(
                latest.data()
              );

            if (savedCount > 0) {

              this.finishSubmission(
                reportId,
                savedCount,
                uid,
                form
              );

              return;
            }
          }

        } catch (checkError) {

          console.warn(
            'Could not verify upload outcome:',
            checkError
          );
        }

        throw uploadError;
      }

      // =====================================
      // UPLOAD SUCCESS CONFIRMED
      // =====================================

      this.finishSubmission(
        reportId,
        this.selectedPhotos.length,
        uid,
        form
      );

    } catch (error: unknown) {

      console.error(
        'Report submission failed:',
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : 'Unexpected submission error.';

      if (this.pendingReportId) {

        this.errorMessage =
          'Report ID: ' + this.pendingReportId +
          '. Submission was not confirmed. ' +
          message +
          ' Retry using this same report ID.';

      } else {

        this.errorMessage =
          'Unable to submit report. ' + message;
      }

    } finally {

      this.isSubmitting = false;
    }
  }
}
