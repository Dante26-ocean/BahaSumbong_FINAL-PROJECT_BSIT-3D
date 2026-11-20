
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
  addDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

type ReportStep = 1 | 2 | 3 | 4;

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
  // FOUR-STEP REPORTING PROCESS
  // =========================================

  currentStep: ReportStep = 1;

  readonly totalSteps = 4;

  // =========================================
  // STEP 1: LOCATION
  // =========================================

  latitude: number | null = null;
  longitude: number | null = null;

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
  // STEP 2: PROBLEM TYPE
  // =========================================

  problemType = '';

  private readonly allowedProblemTypes = [
    'flooding',
    'blocked_drainage',
    'damaged_drainage'
  ];

  // =========================================
  // STEP 3: REPORT DETAILS
  // =========================================

  description = '';

  // =========================================
  // STEP 4: SUPPORTING PHOTOS
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

  // Preserve an already-created report if
  // its photo upload needs to be retried.
  createdReportId: string | null = null;

  completedReportId: string | null = null;

  ngOnInit(): void {
    this.loadMapCoordinates();
  }

  // =========================================
  // GET LOCATION FROM COMMUNITY MAP
  // =========================================

  private loadMapCoordinates(): void {

    const latitudeParam =
      this.route.snapshot.queryParamMap.get(
        'latitude'
      );

    const longitudeParam =
      this.route.snapshot.queryParamMap.get(
        'longitude'
      );

    if (
      latitudeParam === null ||
      longitudeParam === null
    ) {
      return;
    }

    if (
      latitudeParam.trim() === '' ||
      longitudeParam.trim() === ''
    ) {

      this.errorMessage =
        'Invalid coordinates. Please select a location.';

      return;
    }

    const latitude = Number(latitudeParam);
    const longitude = Number(longitudeParam);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {

      this.errorMessage =
        'Invalid coordinates. Please select a location.';

      return;
    }

    this.latitude = latitude;
    this.longitude = longitude;

  }

  // =========================================
  // MOVE TO NEXT STEP
  // =========================================

  nextStep(): void {

    if (
      this.isSubmitting ||
      this.submissionComplete ||
      this.createdReportId
    ) {
      return;
    }

    this.errorMessage = '';

    // STEP 1 VALIDATION
    if (this.currentStep === 1) {

      if (!this.hasSelectedLocation) {

        this.errorMessage =
          'Please select a location on the Community Map.';

        return;
      }

    }

    // STEP 2 VALIDATION
    if (this.currentStep === 2) {

      if (
        !this.allowedProblemTypes.includes(
          this.problemType
        )
      ) {

        this.errorMessage =
          'Please select a valid problem type.';

        return;
      }

    }

    // STEP 3 VALIDATION
    if (this.currentStep === 3) {

      const description =
        this.description.trim();

      if (
        description.length < 10 ||
        description.length > 1000
      ) {

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

  // =========================================
  // MOVE TO PREVIOUS STEP
  // =========================================

  previousStep(): void {

    if (
      this.isSubmitting ||
      this.submissionComplete ||
      this.createdReportId
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
  // ADD SUPPORTING PHOTOS
  // =========================================

  onPhotosSelected(event: Event): void {

    if (
      this.isSubmitting ||
      this.submissionComplete
    ) {
      return;
    }

    this.errorMessage = '';

    const input =
      event.target as HTMLInputElement;

    const newFiles = Array.from(
      input.files || []
    );

    // Allow selecting files individually.
    input.value = '';

    if (newFiles.length === 0) {
      return;
    }

    // VALIDATE NEW FILES
    for (const file of newFiles) {

      if (
        !['image/jpeg', 'image/png'].includes(
          file.type
        )
      ) {

        this.errorMessage =
          'Only JPG and PNG photos are allowed.';

        return;
      }

      if (file.size === 0) {

        this.errorMessage =
          'Empty photos are not allowed.';

        return;
      }

      if (file.size > this.maxPhotoBytes) {

        this.errorMessage =
          'Each photo must be 3 MB or smaller.';

        return;
      }

    }

    // REMOVE DUPLICATES
    const uniqueFiles: File[] = [];

    for (const file of newFiles) {

      const alreadySelected = [
        ...this.selectedPhotos,
        ...uniqueFiles
      ].some(existingFile =>

        existingFile.name === file.name &&
        existingFile.size === file.size &&
        existingFile.lastModified ===
          file.lastModified

      );

      if (!alreadySelected) {
        uniqueFiles.push(file);
      }

    }

    if (uniqueFiles.length === 0) {

      this.errorMessage =
        'These photos are already selected.';

      return;
    }

    // CHECK MAXIMUM PHOTO COUNT
    if (
      this.selectedPhotos.length +
      uniqueFiles.length >
      this.maxPhotos
    ) {

      this.errorMessage =
        'You can attach a maximum of 3 photos.';

      return;
    }

    // KEEP PREVIOUS PHOTOS
    this.selectedPhotos = [
      ...this.selectedPhotos,
      ...uniqueFiles
    ];

  }

  // =========================================
  // REMOVE AN INDIVIDUAL PHOTO
  // =========================================

  removePhoto(index: number): void {

    if (this.isSubmitting) {
      return;
    }

    this.selectedPhotos =
      this.selectedPhotos.filter(
        (_, photoIndex) => photoIndex !== index
      );

    this.errorMessage = '';

  }

  // =========================================
  // CLEAR ALL SELECTED PHOTOS
  // =========================================

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

  // =========================================
  // VALIDATE ALL SELECTED PHOTOS
  // =========================================

  private arePhotosValid(): boolean {

    if (
      this.selectedPhotos.length < 1 ||
      this.selectedPhotos.length > this.maxPhotos
    ) {
      return false;
    }

    return this.selectedPhotos.every(photo =>

      ['image/jpeg', 'image/png'].includes(
        photo.type
      ) &&

      photo.size > 0 &&

      photo.size <= this.maxPhotoBytes

    );

  }

  // =========================================
  // UPLOAD PHOTOS THROUGH NODE.JS BACKEND
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
      'http://127.0.0.1:3000/api/reports/' +
        encodeURIComponent(reportId) +
        '/photos',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${firebaseToken}`
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
      // Handle non-JSON backend responses.
    }

    if (!response.ok) {

      throw new Error(
        responseData.message ||
        `Photo upload failed. HTTP ${response.status}`
      );

    }

  }

  // =========================================
  // SUBMIT REPORT
  // =========================================

  async submitReport(form: NgForm): Promise<void> {

    if (
      this.isSubmitting ||
      this.submissionComplete
    ) {
      return;
    }

    // Prevent accidental submission before
    // the final step.
    if (this.currentStep !== 4) {

      this.nextStep();
      return;

    }

    this.errorMessage = '';
    this.successMessage = '';

    // VALIDATE ALL STEPS
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

    const description =
      this.description.trim();

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
        'Please select 1 to 3 valid JPG or PNG photos, ' +
        'maximum 3 MB each.';

      return;
    }

    const latitude = this.latitude;
    const longitude = this.longitude;

    if (
      latitude === null ||
      longitude === null
    ) {
      return;
    }

    this.isSubmitting = true;

    try {

      // VERIFY FIREBASE SESSION
      await auth.authStateReady();

      const currentUser = auth.currentUser;

      if (!currentUser) {

        throw new Error(
          'Please sign in before submitting.'
        );

      }

      // CREATE FIRESTORE REPORT ONLY ONCE
      if (!this.createdReportId) {

        const locationDescription =
          'Coordinates: ' +
          latitude.toFixed(6) +
          ', ' +
          longitude.toFixed(6);

        const reportDoc = await addDoc(
          collection(db, 'reports'),
          {
            residentId: currentUser.uid,

            problemType: this.problemType,

            description,

            locationDescription,

            latitude,
            longitude,

            status: 'pending',

            createdAt: serverTimestamp()
          }
        );

        this.createdReportId = reportDoc.id;

      }

      // GET CURRENT LOGIN TOKEN
      const firebaseToken =
        await currentUser.getIdToken();

      // UPLOAD SUPPORTING PHOTOS
      await this.uploadReportPhotos(
        this.createdReportId,
        firebaseToken
      );

      // CONFIRMED SUCCESS
      this.completedReportId =
        this.createdReportId;

      this.submissionComplete = true;

      this.successMessage =
        'Your community report and ' +
        this.selectedPhotos.length +
        ' supporting photo(s) were submitted successfully.';

      this.createdReportId = null;

      // Reset form state after success.
      form.resetForm();

      this.problemType = '';
      this.description = '';
      this.selectedPhotos = [];

    } catch (error: unknown) {

      console.error(
        'Report submission failed:',
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';

      if (this.createdReportId) {

        this.errorMessage =
          'Report ' + this.createdReportId +
          ' was created, but its photo upload ' +
          'was not confirmed. ' +
          message +
          ' Please retry without refreshing this page.';

      } else {

        this.errorMessage =
          'Unable to submit report. ' + message;

      }

    } finally {

      this.isSubmitting = false;

    }

  }

}
