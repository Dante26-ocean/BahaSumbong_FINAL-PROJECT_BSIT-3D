
import {
  Component,
  NgZone,
  OnInit,
  OnDestroy
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import { RouterLink } from '@angular/router';

import {
  onAuthStateChanged,
  User,
  Unsubscribe
} from 'firebase/auth';

import {
  doc,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';

import {
  auth,
  db
} from '../../../firebase';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './edit-profile.html',
  styleUrl: './edit-profile.css',
})
export class EditProfile implements OnInit, OnDestroy {

  // ==========================================
  // RESIDENT PROFILE INFORMATION
  // ==========================================

  displayName = '';
  email = '';
  photoURL: string | null = null;

  verificationStatus = '';

  private residentUid = '';
  private originalDisplayName = '';

  // ==========================================
  // COMPONENT STATES
  // ==========================================

  isLoading = true;
  isSaving = false;
  isAuthorized = false;

  errorMessage = '';
  successMessage = '';

  private unsubscribeAuth: Unsubscribe | null = null;
  private currentLoadId = 0;
  private isDestroyed = false;

  constructor(
    private readonly ngZone: NgZone
  ) {}

  // ==========================================
  // INITIALIZE COMPONENT
  // ==========================================

  ngOnInit(): void {

    this.unsubscribeAuth = onAuthStateChanged(

      auth,

      (user) => {
        void this.loadResidentProfile(user);
      },

      () => {

        this.currentLoadId++;

        this.ngZone.run(() => {

          this.isLoading = false;
          this.isAuthorized = false;

          this.errorMessage =
            'Unable to verify your account.';

        });

      }

    );

  }

  // ==========================================
  // LOAD RESIDENT PROFILE
  // ==========================================

  private async loadResidentProfile(
    user: User | null
  ): Promise<void> {

    const loadId = ++this.currentLoadId;

    this.ngZone.run(() => {

      this.isLoading = true;
      this.isAuthorized = false;

      this.displayName = '';
      this.email = '';
      this.photoURL = null;
      this.verificationStatus = '';

      this.residentUid = '';
      this.originalDisplayName = '';

      this.errorMessage = '';
      this.successMessage = '';

    });

    if (!user) {

      this.ngZone.run(() => {

        this.isLoading = false;

        this.errorMessage =
          'Please sign in to edit your profile.';

      });

      return;
    }

    try {

      // ======================================
      // FIRESTORE REFERENCES
      // ======================================

      const userRef = doc(
        db,
        'users',
        user.uid
      );

      const verificationRef = doc(
        db,
        'verificationRequests',
        user.uid
      );

      const [
        userSnapshot,
        verificationSnapshot
      ] = await Promise.all([

        getDocFromServer(userRef),

        getDocFromServer(verificationRef)

      ]);

      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      // ======================================
      // VALIDATE EXISTING ACCOUNT
      // ======================================

      if (
        !userSnapshot.exists() ||
        !verificationSnapshot.exists()
      ) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'Your resident account could not be found.';

        });

        return;
      }

      const userData = userSnapshot.data();

      const verificationData =
        verificationSnapshot.data();

      const isApprovedResident =

        userData['uid'] === user.uid &&

        userData['role'] === 'resident' &&

        userData['verificationStatus'] ===
          'approved' &&

        verificationData['uid'] === user.uid &&

        verificationData['status'] ===
          'approved';

      if (!isApprovedResident) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'Only approved residents can edit their profile.';

        });

        return;
      }

      // ======================================
      // PREPARE PROFILE DATA
      // ======================================

      const firestoreName =
        typeof userData['displayName'] === 'string'
          ? userData['displayName'].trim()
          : '';

      const googleName =
        user.displayName?.trim() || '';

      const currentName =
        firestoreName || googleName || '';

      const currentEmail =
        user.email ||
        (
          typeof userData['email'] === 'string'
            ? userData['email']
            : ''
        );

      // ======================================
      // STORE PROFILE INFORMATION
      // ======================================

      this.ngZone.run(() => {

        this.residentUid = user.uid;

        this.displayName = currentName;

        this.originalDisplayName = currentName;

        this.email = currentEmail;

        this.photoURL = user.photoURL;

        this.verificationStatus = 'approved';

        this.isAuthorized = true;

        this.isLoading = false;

        this.errorMessage = '';

      });

    } catch (error) {

      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      console.error(
        'Failed to load edit profile:',
        error
      );

      this.ngZone.run(() => {

        this.isLoading = false;
        this.isAuthorized = false;

        this.errorMessage =
          'Unable to load your profile. Please try again.';

      });

    }

  }

  // ==========================================
  // SAVE RESIDENT PROFILE
  // ==========================================

  async saveProfile(): Promise<void> {

    if (
      this.isSaving ||
      this.isLoading ||
      !this.isAuthorized
    ) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    // ======================================
    // VALIDATE DISPLAY NAME
    // ======================================

    const updatedName = this.displayName.trim();

    if (updatedName.length < 2) {

      this.errorMessage =
        'Your name must contain at least 2 characters.';

      return;
    }

    if (updatedName.length > 100) {

      this.errorMessage =
        'Your name must not exceed 100 characters.';

      return;
    }

    if (updatedName === this.originalDisplayName) {

      this.successMessage =
        'No changes to save.';

      return;
    }

    const currentUser = auth.currentUser;

    if (
      !currentUser ||
      currentUser.uid !== this.residentUid
    ) {

      this.errorMessage =
        'Your session has changed. Please sign in again.';

      return;
    }

    this.isSaving = true;

    const loadId = this.currentLoadId;

    try {

      // ======================================
      // UPDATE DISPLAY NAME ONLY
      // ======================================

      const userRef = doc(
        db,
        'users',
        this.residentUid
      );

      await updateDoc(userRef, {

        displayName: updatedName

      });

      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      // ======================================
      // UPDATE COMPONENT STATE
      // ======================================

      this.ngZone.run(() => {

        this.displayName = updatedName;

        this.originalDisplayName = updatedName;

        this.successMessage =
          'Your profile has been updated successfully.';

        this.errorMessage = '';

      });

    } catch (error) {

      console.error(
        'Failed to update resident profile:',
        error
      );

      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      this.ngZone.run(() => {

        this.errorMessage =
          'Unable to update your profile. Please try again.';

        this.successMessage = '';

      });

    } finally {

      if (
        !this.isDestroyed &&
        loadId === this.currentLoadId
      ) {

        this.ngZone.run(() => {
          this.isSaving = false;
        });

      }

    }

  }

  // ==========================================
  // RESET UNSAVED CHANGES
  // ==========================================

  resetChanges(): void {

    if (this.isSaving) {
      return;
    }

    this.displayName =
      this.originalDisplayName;

    this.errorMessage = '';
    this.successMessage = '';

  }

  // ==========================================
  // CLEAN UP AUTH LISTENER
  // ==========================================

  ngOnDestroy(): void {

    this.isDestroyed = true;

    this.currentLoadId++;

    if (this.unsubscribeAuth) {

      this.unsubscribeAuth();

      this.unsubscribeAuth = null;

    }

  }

}
