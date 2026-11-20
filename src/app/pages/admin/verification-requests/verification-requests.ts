
import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
  Timestamp
} from 'firebase/firestore';

import { auth } from '../../../firebase';

interface VerificationRequest {
  uid: string;
  displayName: string;
  email: string;
  status: string;
  submittedAt: Date | null;
}

@Component({
  selector: 'app-verification-requests',
  imports: [DatePipe, RouterLink],
  templateUrl: './verification-requests.html',
  styleUrl: './verification-requests.css',
})
export class VerificationRequests implements OnInit {

  requests: VerificationRequest[] = [];

  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    void this.loadRequests();
  }

  async loadRequests(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Wait for Firebase Authentication
      await auth.authStateReady();

      const user = auth.currentUser;

      if (!user) {
        this.errorMessage = 'Please sign in as administrator.';
        return;
      }

      // Connect to Firestore
      const db = getFirestore(auth.app);

      // Get pending verification requests
      const requestsRef = collection(
        db,
        'verificationRequests'
      );

      const pendingQuery = query(
        requestsRef,
        where('status', '==', 'pending')
      );

      const snapshot = await getDocs(pendingQuery);

      // Get resident information
      this.requests = await Promise.all(
        snapshot.docs.map(async (requestDoc) => {

          const requestData = requestDoc.data();

          const userRef = doc(
            db,
            'users',
            requestDoc.id
          );

          const userSnap = await getDoc(userRef);

          const userData = userSnap.exists()
            ? userSnap.data()
            : null;

          const timestamp = requestData['submittedAt'];

          return {
            uid: requestDoc.id,
            displayName:
              userData?.['displayName'] || 'Unknown Resident',
            email:
              userData?.['email'] || 'No email available',
            status: requestData['status'],
            submittedAt:
              timestamp instanceof Timestamp
                ? timestamp.toDate()
                : null
          };
        })
      );

    } catch (error: unknown) {

      console.error('Error loading requests:', error);

      if (
        error instanceof FirebaseError &&
        error.code === 'permission-denied'
      ) {
        this.errorMessage =
          'Permission denied. Please check administrator access.';
      } else {
        this.errorMessage =
          'Unable to load verification requests.';
      }

    } finally {
      this.isLoading = false;
    }
  }
}
