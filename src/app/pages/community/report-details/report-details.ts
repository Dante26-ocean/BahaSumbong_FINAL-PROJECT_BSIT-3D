
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal
} from '@angular/core';

import { DatePipe } from '@angular/common';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import type { User } from 'firebase/auth';

import {
  doc,
  onSnapshot,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// STEP 106.2.3 - CENTRALIZED BACKEND API
// =========================================

import {
  buildBackendApiUrl
} from '../../../config/backend-api.config';

// =========================================
// COMMUNITY REPORT STRUCTURE
// =========================================

interface CommunityReport {
  id: string;
  residentId: string;
  problemType: string;
  description: string;
  locationDescription: string;

  latitude: number | null;
  longitude: number | null;

  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;

  photoCount: number;
}

// =========================================
// PROTECTED REPORT PHOTO
// =========================================

interface ProtectedPhoto {
  index: number;
  url: string;
}

@Component({
  selector: 'app-report-details',
  imports: [DatePipe, RouterLink],
  templateUrl: './report-details.html',
  styleUrl: './report-details.css',
})
export class ReportDetails implements OnInit, OnDestroy {

  private readonly route = inject(ActivatedRoute);

  // =========================================
  // REPORT INFORMATION
  // =========================================

  readonly report = signal<CommunityReport | null>(
    null
  );

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  // =========================================
  // SUPPORTING PHOTO STATES
  // =========================================

  readonly photoUrls = signal<ProtectedPhoto[]>([]);

  readonly isLoadingPhotos = signal(false);
  readonly photoError = signal('');

  // Cancel previous image requests if needed.
  private photoAbortController:
    AbortController | null = null;

  // Prevent unnecessary downloads when only
  // the report status changes.
  private photoFingerprint: string | null = null;

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeReport: Unsubscribe | null = null;

  private destroyed = false;

  ngOnInit(): void {
    void this.loadReportDetails();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    // Stop Firestore updates.
    this.unsubscribeReport?.();

    this.unsubscribeReport = null;

    // Cancel downloads and release image URLs.
    this.resetProtectedPhotos();

  }

  // =========================================
  // LOAD REPORT DETAILS
  // =========================================

  private async loadReportDetails(): Promise<void> {

    try {

      const reportId =
        this.route.snapshot.paramMap.get(
          'reportId'
        );

      if (!reportId) {

        this.errorMessage.set(
          'No report ID was provided.'
        );

        this.isLoading.set(false);
        return;
      }

      // Wait for Firebase Authentication.
      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in to view this report.'
        );

        this.isLoading.set(false);
        return;
      }

      // Reference the selected report.
      const reportRef = doc(
        db,
        'reports',
        reportId
      );

      // Listen for real-time Firestore updates.
      this.unsubscribeReport = onSnapshot(

        reportRef,

        (snapshot) => {

          if (this.destroyed) {
            return;
          }

          // =================================
          // REPORT DOES NOT EXIST
          // =================================

          if (!snapshot.exists()) {

            this.report.set(null);
            this.resetProtectedPhotos();

            this.errorMessage.set(
              'Report not found.'
            );

            this.isLoading.set(false);
            return;
          }

          const data = snapshot.data();

          // =================================
          // VERIFY REPORT OWNERSHIP
          // =================================

          if (
            data['residentId'] !== currentUser.uid
          ) {

            this.report.set(null);
            this.resetProtectedPhotos();

            this.errorMessage.set(
              'You do not have permission to view this report.'
            );

            this.isLoading.set(false);
            return;
          }

          // Backend and Firestore rules provide
          // the actual access enforcement.

          // =================================
          // PROCESS TIMESTAMPS
          // =================================

          const createdAt = data['createdAt'];
          const updatedAt = data['updatedAt'];

          // =================================
          // PROCESS MAP COORDINATES
          // =================================

          const latitude =
            typeof data['latitude'] === 'number'
              ? data['latitude']
              : null;

          const longitude =
            typeof data['longitude'] === 'number'
              ? data['longitude']
              : null;

          // =================================
          // PROCESS PHOTO REFERENCES
          // =================================

          const photoReferences =
            Array.isArray(data['reportPhotos'])
              ? data['reportPhotos']
              : [];

          // =================================
          // UPDATE REPORT INFORMATION
          // =================================

          this.report.set({

            id: snapshot.id,

            residentId: data['residentId'],

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

            latitude,
            longitude,

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

            photoCount: photoReferences.length

          });

          // =================================
          // LOAD PHOTOS ONLY WHEN CHANGED
          // =================================

          const fingerprint =
            snapshot.id + ':' +
            JSON.stringify(photoReferences);

          if (
            this.photoFingerprint !== fingerprint
          ) {

            this.photoFingerprint = fingerprint;

            this.beginProtectedPhotoLoading(
              snapshot.id,
              photoReferences.length,
              currentUser
            );

          }

          this.errorMessage.set('');
          this.isLoading.set(false);

        },

        (error) => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error retrieving report details:',
            error
          );

          this.report.set(null);
          this.resetProtectedPhotos();

          if (
            error.code === 'permission-denied'
          ) {

            this.errorMessage.set(
              'You do not have permission to view this report.'
            );

          } else {

            this.errorMessage.set(
              'Unable to retrieve report details. ' +
              'Please check your connection.'
            );

          }

          this.isLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing Report Details:',
        error
      );

      if (!this.destroyed) {

        this.report.set(null);
        this.resetProtectedPhotos();

        this.errorMessage.set(
          'Something went wrong while loading the report.'
        );

        this.isLoading.set(false);

      }

    }

  }

  // =========================================
  // START PROTECTED PHOTO LOADING
  // =========================================

  private beginProtectedPhotoLoading(
    reportId: string,
    photoCount: number,
    currentUser: User
  ): void {

    // Cancel older requests and release old URLs.
    this.discardProtectedPhotos();

    if (photoCount === 0) {
      return;
    }

    // The backend currently supports
    // a maximum of three report photos.
    if (photoCount > 3) {

      this.photoError.set(
        'This report contains an unsupported photo count.'
      );

      return;
    }

    const controller = new AbortController();

    this.photoAbortController = controller;
    this.isLoadingPhotos.set(true);

    void this.fetchProtectedPhotos(
      reportId,
      photoCount,
      currentUser,
      controller
    );

  }

  // =========================================
  // FETCH AUTHENTICATED REPORT PHOTOS
  // =========================================

  private async fetchProtectedPhotos(
    reportId: string,
    photoCount: number,
    currentUser: User,
    controller: AbortController
  ): Promise<void> {

    const loadedPhotos: ProtectedPhoto[] = [];

    try {

      // Retrieve the current Firebase login token.
      const firebaseToken =
        await currentUser.getIdToken();

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      // Download each protected photo.
      for (
        let index = 0;
        index < photoCount;
        index++
      ) {

        // =================================
        // STEP 106.2.3
        // CENTRALIZED BACKEND PHOTO URL
        // =================================

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
                `Bearer ${firebaseToken}`
            },

            cache: 'no-store',

            signal: controller.signal
          }
        );

        // =================================
        // HANDLE BACKEND ERROR
        // =================================

        if (!response.ok) {

          throw new Error(
            'Photo ' + (index + 1) +
            ' could not be loaded. HTTP ' +
            response.status
          );

        }

        // =================================
        // VALIDATE RESPONSE TYPE
        // =================================

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

        // Convert protected response into a Blob.
        const imageBlob =
          await response.blob();

        if (
          controller.signal.aborted ||
          this.destroyed
        ) {
          return;
        }

        // Create a temporary browser image URL.
        const objectUrl =
          URL.createObjectURL(imageBlob);

        loadedPhotos.push({
          index,
          url: objectUrl
        });

      }

      if (
        controller.signal.aborted ||
        this.destroyed
      ) {
        return;
      }

      // All photos loaded successfully.
      this.photoUrls.set([...loadedPhotos]);

      // Ownership of the URLs has been
      // transferred to the component state.
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
        'Protected report photo loading failed:',
        error
      );

      this.photoError.set(
        error instanceof Error
          ? error.message
          : 'Unable to load supporting photos.'
      );

    } finally {

      // Release any temporary URLs that were
      // not transferred to component state.
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
  // RETRY FAILED PHOTO DOWNLOAD
  // =========================================

  retryPhotoLoading(): void {

    const currentReport = this.report();
    const currentUser = auth.currentUser;

    if (
      !currentReport ||
      !currentUser ||
      currentReport.photoCount === 0
    ) {
      return;
    }

    this.beginProtectedPhotoLoading(
      currentReport.id,
      currentReport.photoCount,
      currentUser
    );

  }

  // =========================================
  // RELEASE PROTECTED IMAGE URLS
  // =========================================

  private discardProtectedPhotos(): void {

    // Cancel an existing request.
    this.photoAbortController?.abort();

    this.photoAbortController = null;

    // Release browser object URLs.
    for (const photo of this.photoUrls()) {
      URL.revokeObjectURL(photo.url);
    }

    this.photoUrls.set([]);
    this.isLoadingPhotos.set(false);
    this.photoError.set('');

  }

  // =========================================
  // RESET PHOTO STATE
  // =========================================

  private resetProtectedPhotos(): void {

    this.photoFingerprint = null;

    this.discardProtectedPhotos();

  }

}
