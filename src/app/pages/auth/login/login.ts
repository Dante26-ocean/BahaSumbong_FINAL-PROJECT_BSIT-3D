
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FirebaseError } from 'firebase/app';

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';

import type { User } from 'firebase/auth';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

import { auth } from '../../../firebase';

// Node.js backend authentication service
import { BackendAuthService } from '../../../services/backend-auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatIconModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  private router = inject(Router);

  // Backend authentication service
  private backendAuth = inject(BackendAuthService);

  adminEmail = '';
  adminPassword = '';

  // Password visibility
  showPassword = false;

  isSubmitting = false;
  errorMessage = '';
  successMessage = '';

  // SHOW OR HIDE PASSWORD
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // VERIFY USER WITH NODE.JS BACKEND
  private async verifyBackendAccess(
    user: User,
    expectedRole: 'resident' | 'admin'
  ): Promise<boolean> {

    try {
      const response = await this.backendAuth.verifyUser(user);

      if (
        response.uid !== user.uid ||
        response.role !== expectedRole
      ) {
        this.errorMessage =
          'Your account could not be authorized by the backend.';

        return false;
      }

      console.log(
        `Backend successfully verified ${expectedRole} access.`
      );

      return true;

    } catch (error: unknown) {

      console.error('Backend verification error:', error);

      this.errorMessage =
        'Unable to verify your account with the backend. Please make sure the backend server is running and try again.';

      return false;
    }
  }

  // RESIDENT GOOGLE LOGIN
  async loginWithGoogle(): Promise<void> {

    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // Step 1: Sign in with Google
      const provider = new GoogleAuthProvider();

      // Always allow Google account selection
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Step 2: Connect to Firestore
      const db = getFirestore(auth.app);

      // Step 3: Check resident profile
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      // Step 4: Register a new resident
      if (!userSnap.exists()) {

        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName ?? '',
          email: user.email ?? '',
          role: 'resident',
          verificationStatus: 'not_submitted'
        });

        const authorized = await this.verifyBackendAccess(
          user,
          'resident'
        );

        if (!authorized) {
          await signOut(auth);
          return;
        }

        await this.router.navigate([
          '/account-confirmation'
        ]);

        return;
      }

      // Step 5: Check existing resident
      const userData = userSnap.data();

      if (userData['role'] !== 'resident') {

        await signOut(auth);

        this.errorMessage =
          'This is not a resident account.';

        return;
      }

      const authorized = await this.verifyBackendAccess(
        user,
        'resident'
      );

      if (!authorized) {
        await signOut(auth);
        return;
      }

      const status = userData['verificationStatus'];

      // Step 6: Check verification status
      if (status === 'not_submitted') {

        const requestRef = doc(
          db,
          'verificationRequests',
          user.uid
        );

        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {

          // Resident has not submitted verification
          await this.router.navigate([
            '/account-confirmation'
          ]);

        } else {

          const requestStatus = requestSnap.data()['status'];

          if (requestStatus === 'pending') {

            // Resident must wait for approval
            await this.router.navigate([
              '/registration-submitted'
            ]);

          } else if (requestStatus === 'rejected') {

            // NEW: Allow another verification attempt
            await this.router.navigate([
              '/account-confirmation'
            ]);

          } else {

            this.errorMessage =
              'Please contact the administrator.';
          }
        }

      } else if (status === 'pending') {

        // Resident is waiting for approval
        await this.router.navigate([
          '/registration-submitted'
        ]);

      } else if (status === 'approved') {

        // Approved residents can access the system
        await this.router.navigate([
          '/community/dashboard'
        ]);

      } else if (status === 'rejected') {

        // NEW: Previously rejected residents can try again
        const requestRef = doc(
          db,
          'verificationRequests',
          user.uid
        );

        const requestSnap = await getDoc(requestRef);

        if (
          requestSnap.exists() &&
          requestSnap.data()['status'] === 'pending'
        ) {

          // An application is already waiting for review
          await this.router.navigate([
            '/registration-submitted'
          ]);

        } else {

          // Return to registration/verification process
          await this.router.navigate([
            '/account-confirmation'
          ]);
        }

      } else {

        this.errorMessage =
          'Unknown verification status.';
      }

    } catch (error: unknown) {

      console.error('Google login error:', error);

      if (error instanceof FirebaseError) {

        if (error.code === 'auth/popup-closed-by-user') {

          this.errorMessage =
            'Google sign-in was cancelled.';

        } else if (error.code === 'auth/popup-blocked') {

          this.errorMessage =
            'Please allow popups in your browser.';

        } else if (error.code === 'permission-denied') {

          this.errorMessage =
            'Firestore permission denied. Please check your security rules.';

        } else {

          this.errorMessage =
            'Google login failed. Please try again.';
        }

      } else {

        this.errorMessage =
          'Something went wrong.';
      }

    } finally {

      this.isSubmitting = false;
    }
  }

  // ADMINISTRATOR EMAIL AND PASSWORD LOGIN
  async loginAsAdmin(): Promise<void> {

    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    let adminSignedIn = false;

    try {
      // Step 1: Sign in using administrator credentials
      const result = await signInWithEmailAndPassword(
        auth,
        this.adminEmail.trim(),
        this.adminPassword
      );

      adminSignedIn = true;

      const user = result.user;

      // Step 2: Connect to Cloud Firestore
      const db = getFirestore(auth.app);

      // Step 3: Find the administrator's profile
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      // Step 4: Verify administrator role
      if (
        !userSnap.exists() ||
        userSnap.data()['role'] !== 'admin' ||
        userSnap.data()['uid'] !== user.uid
      ) {

        await signOut(auth);
        adminSignedIn = false;

        this.errorMessage =
          'This account does not have administrator access.';

        return;
      }

      // Verify administrator with Node.js backend
      const authorized = await this.verifyBackendAccess(
        user,
        'admin'
      );

      if (!authorized) {

        await signOut(auth);
        adminSignedIn = false;

        return;
      }

      // Step 5: Redirect to Admin Dashboard
      await this.router.navigate([
        '/admin/dashboard'
      ]);

    } catch (error: unknown) {

      console.error('Admin login error:', error);

      if (adminSignedIn) {

        try {
          await signOut(auth);

        } catch (signOutError) {

          console.error('Sign out error:', signOutError);
        }
      }

      if (error instanceof FirebaseError) {

        if (
          error.code === 'auth/invalid-credential' ||
          error.code === 'auth/wrong-password' ||
          error.code === 'auth/user-not-found'
        ) {

          this.errorMessage =
            'Invalid email or password.';

        } else if (error.code === 'permission-denied') {

          this.errorMessage =
            'Unable to verify administrator permissions.';

        } else if (error.code === 'auth/too-many-requests') {

          this.errorMessage =
            'Too many login attempts. Please try again later.';

        } else {

          this.errorMessage =
            'Administrator login failed. Please try again.';
        }

      } else {

        this.errorMessage =
          'Something went wrong during administrator login.';
      }

    } finally {

      this.adminPassword = '';
      this.showPassword = false;
      this.isSubmitting = false;
    }
  }
}
