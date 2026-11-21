
import {
  Component,
  OnInit,
  OnDestroy,
  signal
} from '@angular/core';

import {
  onAuthStateChanged,
  User,
  Unsubscribe
} from 'firebase/auth';

import {
  doc,
  getDocFromServer
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// ADMINISTRATOR PROFILE STRUCTURE
// =========================================

interface AdministratorProfile {

  uid: string;

  displayName: string;

  email: string;

  role: 'admin';

}

@Component({
  selector: 'app-profile',
  imports: [],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit, OnDestroy {

  // =========================================
  // ADMINISTRATOR PROFILE STATE
  // =========================================

  readonly adminProfile =
    signal<AdministratorProfile | null>(null);

  readonly isLoading = signal(true);

  readonly errorMessage = signal('');

  // =========================================
  // FIREBASE AUTHENTICATION LISTENER
  // =========================================

  private unsubscribeAuth: Unsubscribe | null = null;

  private destroyed = false;

  private currentLoadId = 0;

  // =========================================
  // INITIALIZE COMPONENT
  // =========================================

  ngOnInit(): void {

    this.unsubscribeAuth = onAuthStateChanged(

      auth,

      (user) => {

        void this.loadAdministratorProfile(user);

      },

      (error) => {

        if (this.destroyed) {
          return;
        }

        this.currentLoadId++;

        console.error(
          'Administrator authentication error:',
          error
        );

        this.adminProfile.set(null);

        this.errorMessage.set(
          'Unable to verify your administrator account.'
        );

        this.isLoading.set(false);

      }

    );

  }

  // =========================================
  // LOAD ADMINISTRATOR PROFILE
  // =========================================

  private async loadAdministratorProfile(
    user: User | null
  ): Promise<void> {

    const loadId = ++this.currentLoadId;

    this.isLoading.set(true);

    this.errorMessage.set('');

    this.adminProfile.set(null);

    // =====================================
    // CHECK AUTHENTICATION
    // =====================================

    if (!user) {

      this.errorMessage.set(
        'Please sign in as an administrator.'
      );

      this.isLoading.set(false);

      return;

    }

    try {

      // =====================================
      // RETRIEVE ADMINISTRATOR ACCOUNT
      // =====================================

      const adminRef = doc(
        db,
        'users',
        user.uid
      );

      const adminSnapshot =
        await getDocFromServer(adminRef);

      if (
        this.destroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      // =====================================
      // CHECK ACCOUNT EXISTENCE
      // =====================================

      if (!adminSnapshot.exists()) {

        this.errorMessage.set(
          'Administrator account not found.'
        );

        return;

      }

      const adminData = adminSnapshot.data();

      // =====================================
      // VERIFY ADMINISTRATOR ROLE
      // =====================================

      if (
        adminData['uid'] !== user.uid ||
        adminData['role'] !== 'admin'
      ) {

        this.errorMessage.set(
          'Administrator access is required.'
        );

        return;

      }

      // =====================================
      // READ ADMINISTRATOR DISPLAY NAME
      // =====================================

      const firestoreDisplayName =
        typeof adminData['displayName'] === 'string'
          ? adminData['displayName'].trim()
          : '';

      const firebaseDisplayName =
        user.displayName?.trim() || '';

      const displayName =
        firestoreDisplayName ||
        firebaseDisplayName ||
        'Administrator';

      // =====================================
      // READ ADMINISTRATOR EMAIL
      // =====================================

      const email =
        user.email ||
        (
          typeof adminData['email'] === 'string'
            ? adminData['email']
            : ''
        );

      // =====================================
      // STORE ADMINISTRATOR PROFILE
      // =====================================

      this.adminProfile.set({

        uid: user.uid,

        displayName: displayName,

        email: email,

        role: 'admin'

      });

      this.errorMessage.set('');

    } catch (error) {

      if (
        this.destroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      console.error(
        'Unable to load administrator profile:',
        error
      );

      this.adminProfile.set(null);

      this.errorMessage.set(
        'Unable to retrieve your profile. ' +
        'Please check your connection and try again.'
      );

    } finally {

      if (
        !this.destroyed &&
        loadId === this.currentLoadId
      ) {

        this.isLoading.set(false);

      }

    }

  }

  // =========================================
  // REFRESH ADMINISTRATOR PROFILE
  // =========================================

  refreshProfile(): void {

    if (this.destroyed) {
      return;
    }

    void this.loadAdministratorProfile(
      auth.currentUser
    );

  }

  // =========================================
  // COMPONENT CLEANUP
  // =========================================

  ngOnDestroy(): void {

    this.destroyed = true;

    this.currentLoadId++;

    if (this.unsubscribeAuth) {

      this.unsubscribeAuth();

      this.unsubscribeAuth = null;

    }

  }

}
