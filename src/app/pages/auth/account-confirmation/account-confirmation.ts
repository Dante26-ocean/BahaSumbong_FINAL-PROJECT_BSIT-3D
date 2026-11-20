
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { signOut } from 'firebase/auth';

import {
  doc,
  getDoc,
  getFirestore
} from 'firebase/firestore';

import { auth } from '../../../firebase';

@Component({
  selector: 'app-account-confirmation',
  imports: [MatIconModule],
  templateUrl: './account-confirmation.html',
  styleUrl: './account-confirmation.css',
})
export class AccountConfirmation implements OnInit {

  private router = inject(Router);

  displayName = '';
  email = '';

  // Display the authenticated resident's Google photo
  profilePhotoUrl = '';

  isLoading = true;
  isReady = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadAccount();
  }

  async loadAccount(): Promise<void> {

    this.isLoading = true;
    this.isReady = false;
    this.errorMessage = '';

    try {
      // Wait until Firebase finishes checking authentication
      await auth.authStateReady();

      const user = auth.currentUser;

      // Return to login if there is no signed-in account
      if (!user) {
        await this.router.navigate(['/login']);
        return;
      }

      // Get the resident profile from Firestore
      const db = getFirestore(auth.app);

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.errorMessage = 'Resident profile not found.';
        return;
      }

      const userData = userSnap.data();

      // Only residents can access account confirmation
      if (userData['role'] !== 'resident') {
        this.errorMessage =
          'This account does not have resident access.';
        return;
      }

      const status = userData['verificationStatus'];

      // Approved residents should access their dashboard
      if (status === 'approved') {
        await this.router.navigate([
          '/community/dashboard'
        ]);
        return;
      }

      // Pending residents must wait for admin approval
      if (status === 'pending') {
        await this.router.navigate([
          '/registration-submitted'
        ]);
        return;
      }

      // Only new or rejected residents can continue
      if (
        status !== 'not_submitted' &&
        status !== 'rejected'
      ) {
        this.errorMessage =
          'Unknown account verification status.';
        return;
      }

      // Check whether a verification request already exists
      const requestRef = doc(
        db,
        'verificationRequests',
        user.uid
      );

      const requestSnap = await getDoc(requestRef);

      if (requestSnap.exists()) {

        const requestStatus = requestSnap.data()['status'];

        // Prevent duplicate pending submissions
        if (requestStatus === 'pending') {
          await this.router.navigate([
            '/registration-submitted'
          ]);
          return;
        }

        // Do not override an approved verification request
        if (requestStatus === 'approved') {
          this.errorMessage =
            'Your verification request is approved, but your account status has not been updated. Please contact the administrator.';
          return;
        }

        // Allow previously rejected requests to be resubmitted
        if (requestStatus !== 'rejected') {
          this.errorMessage =
            'Unable to determine your verification request status.';
          return;
        }
      }

      // New residents and rejected residents can continue
      this.displayName =
        userData['displayName'] || user.displayName || '';

      this.email =
        userData['email'] || user.email || '';

      // Get Google account profile picture
      this.profilePhotoUrl = user.photoURL || '';

      this.isReady = true;

    } catch (error: unknown) {

      console.error('Account confirmation error:', error);

      this.errorMessage =
        'Unable to load your account. Please try again.';

    } finally {
      this.isLoading = false;
    }
  }

  // Continue to identity verification
  async next(): Promise<void> {

    if (!this.isReady || this.isLoading) {
      return;
    }

    await this.router.navigate([
      '/identity-verification'
    ]);
  }

  // Cancel and return to login
  async cancel(): Promise<void> {

    try {
      await signOut(auth);

      await this.router.navigate([
        '/login'
      ]);

    } catch (error: unknown) {

      console.error('Sign out error:', error);

      this.errorMessage =
        'Unable to sign out. Please try again.';
    }
  }
}
