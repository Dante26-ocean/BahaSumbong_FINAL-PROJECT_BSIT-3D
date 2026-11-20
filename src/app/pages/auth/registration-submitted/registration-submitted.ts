
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { signOut } from 'firebase/auth';

import {
  doc,
  getDoc,
  getFirestore
} from 'firebase/firestore';

import { auth } from '../../../firebase';

@Component({
  selector: 'app-registration-submitted',
  imports: [],
  templateUrl: './registration-submitted.html',
  styleUrl: './registration-submitted.css',
})
export class RegistrationSubmitted implements OnInit {

  private router = inject(Router);

  isLoading = true;
  isPending = false;
  isSigningOut = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.checkSubmission();
  }

  async checkSubmission(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Step 1: Check Firebase authentication
      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        await this.router.navigate(['/login']);
        return;
      }

      const db = getFirestore(auth.app);

      // Step 2: Check resident profile
      const userRef = doc(db, 'users', user.uid);
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

      // Step 3: Check verification request
      const requestRef = doc(
        db,
        'verificationRequests',
        user.uid
      );

      const requestSnap = await getDoc(requestRef);

      if (!requestSnap.exists()) {
        await this.router.navigate(['/account-confirmation']);
        return;
      }

      // Step 4: Check pending status
      const requestData = requestSnap.data();

      if (
        requestData['status'] === 'pending' &&
        userData['verificationStatus'] !== 'approved'
      ) {
        this.isPending = true;
      } else {
        this.errorMessage =
          'This registration is no longer pending review.';
      }

    } catch (error) {
      console.error('Submission check error:', error);
      this.errorMessage = 'Unable to check registration status.';

    } finally {
      this.isLoading = false;
    }
  }

  // Return to Login Page
  async backToLogin(): Promise<void> {
    this.isSigningOut = true;
    this.errorMessage = '';

    try {
      await signOut(auth);
      await this.router.navigate(['/login']);

    } catch (error) {
      console.error('Sign out error:', error);
      this.errorMessage = 'Unable to sign out. Please try again.';

    } finally {
      this.isSigningOut = false;
    }
  }
}
