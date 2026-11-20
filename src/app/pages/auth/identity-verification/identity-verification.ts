
import {
  Component,
  inject,
  OnInit,
  OnDestroy
} from '@angular/core';

import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { FirebaseError } from 'firebase/app';
import { getIdToken } from 'firebase/auth';

import {
  doc,
  getDoc,
  getFirestore
} from 'firebase/firestore';

import { auth } from '../../../firebase';

interface VerificationUploadResponse {
  status?: string;
  message?: string;
}

@Component({
  selector: 'app-identity-verification',
  imports: [MatIconModule],
  templateUrl: './identity-verification.html',
  styleUrl: './identity-verification.css',
})
export class IdentityVerification implements OnInit, OnDestroy {

  private router = inject(Router);

  // Protected Node.js backend endpoint
  private readonly uploadEndpoint =
    'http://127.0.0.1:3000/api/verification/submit';

  isLoading = true;
  isAllowed = false;
  isSubmitting = false;

  errorMessage = '';

  // Selected demonstration images
  frontSample: File | null = null;
  backSample: File | null = null;

  // Local image previews
  frontPreviewUrl: string | null = null;
  backPreviewUrl: string | null = null;

  ngOnInit(): void {
    void this.checkResident();
  }

  ngOnDestroy(): void {

    // Release temporary image URLs
    if (this.frontPreviewUrl) {
      URL.revokeObjectURL(this.frontPreviewUrl);
    }

    if (this.backPreviewUrl) {
      URL.revokeObjectURL(this.backPreviewUrl);
    }
  }

  // =========================================
  // CHECK RESIDENT ACCOUNT
  // =========================================

  async checkResident(): Promise<void> {

    this.isLoading = true;
    this.isAllowed = false;
    this.errorMessage = '';

    try {

      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        await this.router.navigate(['/login']);
        return;
      }

      const db = getFirestore(auth.app);

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.errorMessage = 'Resident profile not found.';
        return;
      }

      const userData = userSnap.data();

      // Only resident accounts can submit verification
      if (userData['role'] !== 'resident') {
        this.errorMessage =
          'This account does not have resident access.';
        return;
      }

      const status = userData['verificationStatus'];

      // Approved residents go to their dashboard
      if (status === 'approved') {
        await this.router.navigate([
          '/community/dashboard'
        ]);
        return;
      }

      // Pending residents must wait
      if (status === 'pending') {
        await this.router.navigate([
          '/registration-submitted'
        ]);
        return;
      }

      // Allow new and previously rejected residents
      if (
        status !== 'not_submitted' &&
        status !== 'rejected'
      ) {
        this.errorMessage =
          'This account cannot continue verification.';
        return;
      }

      // Check for an existing verification request
      const requestRef = doc(
        db,
        'verificationRequests',
        user.uid
      );

      const requestSnap = await getDoc(requestRef);

      if (requestSnap.exists()) {

        const requestStatus = requestSnap.data()['status'];

        // Prevent duplicate pending requests
        if (requestStatus === 'pending') {
          await this.router.navigate([
            '/registration-submitted'
          ]);
          return;
        }

        // Do not resubmit an approved request
        if (requestStatus === 'approved') {
          this.errorMessage =
            'Your request is already approved. Please contact the administrator if your account is still restricted.';
          return;
        }

        // Rejected requests may be resubmitted
        if (requestStatus !== 'rejected') {
          this.errorMessage =
            'Unable to determine your verification request status.';
          return;
        }
      }

      // Resident may submit or resubmit
      this.isAllowed = true;

    } catch (error: unknown) {

      console.error('Verification error:', error);

      if (
        error instanceof FirebaseError &&
        error.code === 'permission-denied'
      ) {
        this.errorMessage =
          'Unable to access your verification information.';
      } else {
        this.errorMessage =
          'Unable to verify your account. Please try again.';
      }

    } finally {
      this.isLoading = false;
    }
  }

  // =========================================
  // SELECT AND PREVIEW IMAGE
  // =========================================

  selectFile(event: Event, side: 'front' | 'back'): void {

    this.errorMessage = '';

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    // Clear the previous image
    if (side === 'front') {

      if (this.frontPreviewUrl) {
        URL.revokeObjectURL(this.frontPreviewUrl);
      }

      this.frontSample = null;
      this.frontPreviewUrl = null;

    } else {

      if (this.backPreviewUrl) {
        URL.revokeObjectURL(this.backPreviewUrl);
      }

      this.backSample = null;
      this.backPreviewUrl = null;
    }

    if (!file) return;

    // Validate image type and size
    const validTypes = [
      'image/jpeg',
      'image/png'
    ];

    const maxSize = 3 * 1024 * 1024;

    if (
      !validTypes.includes(file.type) ||
      file.size === 0 ||
      file.size > maxSize
    ) {
      this.errorMessage =
        'Please select a valid JPG or PNG sample image with a maximum size of 3 MB.';

      input.value = '';
      return;
    }

    // Create a temporary browser preview
    const previewUrl = URL.createObjectURL(file);

    if (side === 'front') {

      this.frontSample = file;
      this.frontPreviewUrl = previewUrl;

    } else {

      this.backSample = file;
      this.backPreviewUrl = previewUrl;
    }
  }

  // =========================================
  // CHECK IF BOTH IMAGES ARE SELECTED
  // =========================================

  get readyToSubmit(): boolean {

    return this.isAllowed &&
      !this.isLoading &&
      !this.isSubmitting &&
      this.frontSample !== null &&
      this.backSample !== null;
  }

  // =========================================
  // SUBMIT THROUGH PROTECTED NODE.JS BACKEND
  // =========================================

  async submitVerification(): Promise<void> {

    if (
      !this.readyToSubmit ||
      !this.frontSample ||
      !this.backSample
    ) {
      return;
    }

    // Preserve the selected files
    const frontFile = this.frontSample;
    const backFile = this.backSample;

    this.isSubmitting = true;
    this.errorMessage = '';

    try {

      // Step 1: Verify the Firebase login session
      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        await this.router.navigate(['/login']);
        return;
      }

      // Step 2: Obtain Firebase authentication token
      const firebaseToken = await getIdToken(user);

      // Step 3: Prepare the selected sample images
      const formData = new FormData();

      formData.append(
        'frontImage',
        frontFile,
        frontFile.name
      );

      formData.append(
        'backImage',
        backFile,
        backFile.name
      );

      // Step 4: Send both images to Node.js backend
      const response = await fetch(this.uploadEndpoint, {

        method: 'POST',

        headers: {
          Authorization: `Bearer ${firebaseToken}`
        },

        body: formData
      });

      // The browser automatically sets multipart/form-data
      // with the appropriate boundary.
      // Do not manually set the Content-Type header.

      // Step 5: Read the backend response
      let result: VerificationUploadResponse | null = null;

      try {
        result = (
          await response.json()
        ) as VerificationUploadResponse;

      } catch {
        result = null;
      }

      // Step 6: Handle failed submissions
      if (!response.ok) {

        if (response.status === 401) {
          throw new Error(
            'Your login session is invalid or expired. Please sign in again.'
          );
        }

        if (response.status === 403) {
          throw new Error(
            'Your resident account is not authorized to submit verification.'
          );
        }

        if (response.status === 409) {
          throw new Error(
            'Your verification status may have changed or a request may already be pending. Please refresh and check your account status.'
          );
        }

        if (response.status === 400) {
          throw new Error(
            result?.message ||
            'Invalid images. Please select two JPG or PNG sample images.'
          );
        }

        throw new Error(
          result?.message ||
          'Unable to submit verification images. Please try again.'
        );
      }

      // Step 7: Confirm backend success
      if (result?.status !== 'success') {

        throw new Error(
          'The server returned an unexpected response. Please check your verification status before trying again.'
        );
      }

      console.log(
        'Verification images submitted successfully.'
      );

      // Step 8: Prevent another submission
      this.isAllowed = false;

      // Step 9: Redirect to registration-submitted page
      await this.router.navigate([
        '/registration-submitted'
      ]);

    } catch (error: unknown) {

      console.error(
        'Verification submission error:',
        error
      );

      if (error instanceof TypeError) {

        this.errorMessage =
          'Unable to connect to the BahaSumbong backend. Please make sure the Node.js server is running.';

      } else if (error instanceof Error) {

        this.errorMessage = error.message;

      } else {

        this.errorMessage =
          'Something went wrong while submitting your verification images.';
      }

    } finally {

      this.isSubmitting = false;
    }
  }

  // =========================================
  // BACK TO ACCOUNT CONFIRMATION
  // =========================================

  async back(): Promise<void> {

    await this.router.navigate([
      '/account-confirmation'
    ]);
  }
}
