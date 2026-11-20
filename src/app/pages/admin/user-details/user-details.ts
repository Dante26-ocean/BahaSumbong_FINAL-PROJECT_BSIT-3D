
import {
  Component,
  inject,
  OnInit,
  OnDestroy
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { getIdToken } from 'firebase/auth';

import {
  doc,
  getDoc,
  getFirestore,
  Timestamp,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';

import { auth } from '../../../firebase';

interface ResidentDetails {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  verificationStatus: string;
}

type ImageSide = 'front' | 'back';

@Component({
  selector: 'app-user-details',
  imports: [DatePipe, RouterLink],
  templateUrl: './user-details.html',
  styleUrl: './user-details.css',
})
export class UserDetails implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);

  private readonly imageEndpoint =
    'http://127.0.0.1:3000/api/verification/images';

  private destroyed = false;

  resident: ResidentDetails | null = null;

  requestStatus = '';
  submittedAt: Date | null = null;

  demoOnly = false;
  frontSampleSelected = false;
  backSampleSelected = false;

  // CLOUDINARY IMAGE VIEWING
  hasFrontImage = false;
  hasBackImage = false;

  frontImageUrl: string | null = null;
  backImageUrl: string | null = null;

  isLoadingImages = false;
  imageErrorMessage = '';

  // EXISTING ADMINISTRATOR STATES
  isLoading = true;
  isProcessing = false;

  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    void this.loadResident();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearImageUrls();
  }

  // RELEASE TEMPORARY IMAGE URLS
  private clearImageUrls(): void {

    if (this.frontImageUrl) {
      URL.revokeObjectURL(this.frontImageUrl);
      this.frontImageUrl = null;
    }

    if (this.backImageUrl) {
      URL.revokeObjectURL(this.backImageUrl);
      this.backImageUrl = null;
    }
  }

  // LOAD RESIDENT INFORMATION
  async loadResident(): Promise<void> {

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.resident = null;
    this.requestStatus = '';
    this.submittedAt = null;

    this.demoOnly = false;
    this.frontSampleSelected = false;
    this.backSampleSelected = false;

    this.hasFrontImage = false;
    this.hasBackImage = false;

    this.imageErrorMessage = '';
    this.clearImageUrls();

    let imageResidentUid: string | null = null;

    try {
      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        this.errorMessage =
          'Please sign in as administrator.';
        return;
      }

      // Get resident UID from URL
      const uid = this.route.snapshot.paramMap.get('uid');

      if (!uid) {
        this.errorMessage = 'Resident ID not found.';
        return;
      }

      const db = getFirestore(auth.app);

      // Get resident profile
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.errorMessage = 'Resident profile not found.';
        return;
      }

      const userData = userSnap.data();

      if (userData['role'] !== 'resident') {
        this.errorMessage = 'This is not a resident account.';
        return;
      }

      this.resident = {
        uid: uid,
        displayName: userData['displayName'] || '',
        email: userData['email'] || '',
        role: userData['role'],
        verificationStatus:
          userData['verificationStatus'] || 'unknown'
      };

      // Get verification request
      const requestRef = doc(
        db,
        'verificationRequests',
        uid
      );

      const requestSnap = await getDoc(requestRef);

      if (!requestSnap.exists()) {
        this.errorMessage =
          'Verification request not found.';
        return;
      }

      const requestData = requestSnap.data();

      this.requestStatus =
        requestData['status'] || 'unknown';

      this.demoOnly =
        requestData['demoOnly'] === true;

      // Detect protected Cloudinary images
      this.hasFrontImage =
        typeof requestData['frontImagePublicId'] ===
        'string' &&
        requestData['frontImagePublicId'].length > 0 &&
        requestData['imageDeliveryType'] ===
        'authenticated';

      this.hasBackImage =
        typeof requestData['backImagePublicId'] ===
        'string' &&
        requestData['backImagePublicId'].length > 0 &&
        requestData['imageDeliveryType'] ===
        'authenticated';

      // Support both old demo requests and
      // new Cloudinary-backed requests.
      this.frontSampleSelected =
        requestData['frontSampleSelected'] === true ||
        this.hasFrontImage;

      this.backSampleSelected =
        requestData['backSampleSelected'] === true ||
        this.hasBackImage;

      const timestamp = requestData['submittedAt'];

      this.submittedAt =
        timestamp instanceof Timestamp
          ? timestamp.toDate()
          : null;

      // Load images only when Cloudinary references exist
      if (this.hasFrontImage || this.hasBackImage) {
        imageResidentUid = uid;
      }

    } catch (error: unknown) {

      console.error('User details error:', error);

      if (
        error instanceof FirebaseError &&
        error.code === 'permission-denied'
      ) {
        this.errorMessage =
          'Permission denied. Administrator access required.';
      } else {
        this.errorMessage =
          'Unable to load resident information.';
      }

    } finally {
      this.isLoading = false;
    }

    // Load protected images separately so an image
    // retrieval error doesn't hide resident information
    // or administrator decision buttons.
    if (imageResidentUid && !this.destroyed) {
      await this.loadProtectedImages(imageResidentUid);
    }
  }

  // FETCH ONE PROTECTED IMAGE FROM NODE.JS
  private async fetchProtectedImage(
    uid: string,
    side: ImageSide,
    token: string
  ): Promise<string> {

    const url =
      `${this.imageEndpoint}/${encodeURIComponent(uid)}/${side}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(
        `Unable to load ${side} image (HTTP ${response.status}).`
      );
    }

    // Only accept expected image responses
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim();

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png'
    ) {
      throw new Error(
        `Unexpected response for ${side} image.`
      );
    }

    const blob = await response.blob();

    if (
      blob.size === 0 ||
      blob.size > 5 * 1024 * 1024
    ) {
      throw new Error(
        `Invalid ${side} image size.`
      );
    }

    // Temporary image URL in this browser session
    return URL.createObjectURL(blob);
  }

  // LOAD CLOUDINARY IMAGES THROUGH PROTECTED BACKEND
  private async loadProtectedImages(
    uid: string
  ): Promise<void> {

    this.isLoadingImages = true;
    this.imageErrorMessage = '';

    try {
      const admin = auth.currentUser;

      if (!admin) {
        throw new Error(
          'Administrator session not found.'
        );
      }

      // Firebase token authenticates each image request
      const token = await getIdToken(admin);

      // Load front and back independently
      const results = await Promise.allSettled([
        this.hasFrontImage
          ? this.fetchProtectedImage(uid, 'front', token)
          : Promise.resolve(null),

        this.hasBackImage
          ? this.fetchProtectedImage(uid, 'back', token)
          : Promise.resolve(null)
      ]);

      // Release any URLs if the component was destroyed
      if (this.destroyed) {

        for (const result of results) {
          if (
            result.status === 'fulfilled' &&
            result.value
          ) {
            URL.revokeObjectURL(result.value);
          }
        }

        return;
      }

      const [frontResult, backResult] = results;

      const failures: string[] = [];

      if (frontResult.status === 'fulfilled') {
        this.frontImageUrl = frontResult.value;
      } else {
        failures.push('front');
        console.error(
          'Front verification image error:',
          frontResult.reason
        );
      }

      if (backResult.status === 'fulfilled') {
        this.backImageUrl = backResult.value;
      } else {
        failures.push('back');
        console.error(
          'Back verification image error:',
          backResult.reason
        );
      }

      if (failures.length > 0) {
        this.imageErrorMessage =
          `Unable to display the ${failures.join(' and ')} verification image(s). Please check the backend terminal.`;
      }

    } catch (error: unknown) {

      console.error(
        'Protected image loading error:',
        error
      );

      this.imageErrorMessage =
        'Unable to load protected verification images. Please sign in as administrator and try again.';

    } finally {
      this.isLoadingImages = false;
    }
  }

  // CHECK IF THE DEMO REQUEST CAN BE REVIEWED
  get canReview(): boolean {

    if (
      this.isLoading ||
      this.isProcessing ||
      this.resident === null
    ) {
      return false;
    }

    // Support first-time and resubmitted requests
    const validAccountStatus = [
      'not_submitted',
      'pending'
    ].includes(this.resident.verificationStatus);

    return validAccountStatus &&
      this.requestStatus === 'pending' &&
      this.demoOnly;
  }

  // ADMINISTRATOR DEMO APPROVAL / REJECTION
  async reviewResident(
    decision: 'approved' | 'rejected'
  ): Promise<void> {

    if (!this.canReview || !this.resident) return;

    const confirmed = window.confirm(
      `This is a simulated review using test data only.\n\n` +
      `Do you want to ${decision === 'approved' ? 'ACCEPT' : 'DECLINE'} ` +
      `this resident's demo application?`
    );

    if (!confirmed) return;

    this.isProcessing = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await auth.authStateReady();

      const admin = auth.currentUser;

      if (!admin) {
        this.errorMessage =
          'Administrator session not found.';
        return;
      }

      const db = getFirestore(auth.app);
      const residentUid = this.resident.uid;

      // Reference both Firestore documents
      const userRef = doc(
        db,
        'users',
        residentUid
      );

      const requestRef = doc(
        db,
        'verificationRequests',
        residentUid
      );

      // Atomic update preserves existing admin behavior
      const batch = writeBatch(db);

      // Update resident status
      batch.update(userRef, {
        verificationStatus: decision
      });

      // Update verification request
      batch.update(requestRef, {
        status: decision,
        reviewedBy: admin.uid,
        reviewedAt: serverTimestamp()
      });

      // Save both updates together
      await batch.commit();

      // Update displayed information
      this.resident.verificationStatus = decision;
      this.requestStatus = decision;

      this.successMessage =
        decision === 'approved'
          ? 'Demo application accepted successfully.'
          : 'Demo application declined successfully.';

    } catch (error: unknown) {

      console.error('Review error:', error);

      if (
        error instanceof FirebaseError &&
        error.code === 'permission-denied'
      ) {
        this.errorMessage =
          'Permission denied. Check administrator permissions and request status.';
      } else {
        this.errorMessage =
          'Unable to save the review decision. Please try again.';
      }

    } finally {
      this.isProcessing = false;
    }
  }
}
