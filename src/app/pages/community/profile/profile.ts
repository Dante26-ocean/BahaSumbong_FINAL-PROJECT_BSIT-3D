
import {
  Component,
  NgZone,
  OnInit,
  OnDestroy
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  onAuthStateChanged,
  User,
  Unsubscribe
} from 'firebase/auth';

import {
  doc,
  getDocFromServer
} from 'firebase/firestore';

import {
  auth,
  db
} from '../../../firebase';

// ==========================================
// RESIDENT PROFILE DATA STRUCTURE
// ==========================================

export interface ResidentProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: 'resident';
  verificationStatus: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit, OnDestroy {

  // ==========================================
  // PROFILE STATE
  // ==========================================

  residentProfile: ResidentProfile | null = null;

  isLoading = true;

  errorMessage = '';

  private unsubscribeAuth: Unsubscribe | null = null;

  private currentLoadId = 0;

  constructor(
    private readonly ngZone: NgZone
  ) {}

  // ==========================================
  // INITIALIZE PROFILE
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

          this.residentProfile = null;

          this.isLoading = false;

          this.errorMessage =
            'Unable to verify your account. Please try again.';

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

      this.errorMessage = '';

      this.residentProfile = null;

    });

    if (!user) {

      this.ngZone.run(() => {

        this.isLoading = false;

        this.errorMessage =
          'Please sign in to view your profile.';

      });

      return;
    }

    try {

      const userRef = doc(
        db,
        'users',
        user.uid
      );

      const userSnapshot = await getDocFromServer(
        userRef
      );

      if (loadId !== this.currentLoadId) {
        return;
      }

      if (!userSnapshot.exists()) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'Your resident profile could not be found.';

        });

        return;
      }

      const userData = userSnapshot.data();

      // ==========================================
      // VALIDATE RESIDENT ACCOUNT
      // ==========================================

      if (
        userData['uid'] !== user.uid ||
        userData['role'] !== 'resident'
      ) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'This account is not a valid resident account.';

        });

        return;
      }

      // ==========================================
      // PREPARE PROFILE INFORMATION
      // ==========================================

      const firestoreName =
        typeof userData['displayName'] === 'string'
          ? userData['displayName'].trim()
          : '';

      const googleName =
        user.displayName?.trim() || '';

      const displayName =
        firestoreName || googleName || 'Resident';

      const firestoreEmail =
        typeof userData['email'] === 'string'
          ? userData['email']
          : '';

      const email =
        user.email || firestoreEmail;

      const verificationStatus =
        typeof userData['verificationStatus'] === 'string'
          ? userData['verificationStatus']
          : 'unknown';

      // ==========================================
      // STORE PROFILE DATA
      // ==========================================

      this.ngZone.run(() => {

        this.residentProfile = {

          uid: user.uid,

          displayName: displayName,

          email: email,

          photoURL: user.photoURL,

          role: 'resident',

          verificationStatus: verificationStatus

        };

        this.isLoading = false;

        this.errorMessage = '';

      });

    } catch (error) {

      if (loadId !== this.currentLoadId) {
        return;
      }

      console.error(
        'Failed to load resident profile:',
        error
      );

      this.ngZone.run(() => {

        this.residentProfile = null;

        this.isLoading = false;

        this.errorMessage =
          'Unable to load your profile. Please check your connection and try again.';

      });

    }

  }

  // ==========================================
  // REFRESH PROFILE INFORMATION
  // ==========================================

  async refreshProfile(): Promise<void> {

    await this.loadResidentProfile(
      auth.currentUser
    );

  }

  // ==========================================
  // CLEAN UP AUTH LISTENER
  // ==========================================

  ngOnDestroy(): void {

    this.currentLoadId++;

    if (this.unsubscribeAuth) {

      this.unsubscribeAuth();

      this.unsubscribeAuth = null;

    }

  }

}
