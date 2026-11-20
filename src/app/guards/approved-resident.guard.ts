
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import {
  doc,
  getFirestore,
  getDocFromServer
} from 'firebase/firestore';

import { auth } from '../firebase';

export const approvedResidentGuard: CanActivateFn = async () => {

  const router = inject(Router);

  try {
    // Wait for Firebase Authentication
    await auth.authStateReady();

    const user = auth.currentUser;

    // Block visitors who are not signed in
    if (!user) {
      return router.createUrlTree(['/login']);
    }

    const db = getFirestore(auth.app);

    // Check the resident profile
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDocFromServer(userRef);

    if (!userSnap.exists()) {
      return router.createUrlTree(['/login']);
    }

    const userData = userSnap.data();

    // Only residents can access community pages
    if (userData['role'] !== 'resident') {
      return router.createUrlTree(['/login']);
    }

    // Check the verification request
    const requestRef = doc(
      db,
      'verificationRequests',
      user.uid
    );

    const requestSnap = await getDocFromServer(requestRef);

    // Both statuses must be approved
    if (
      userData['verificationStatus'] === 'approved' &&
      requestSnap.exists() &&
      requestSnap.data()['status'] === 'approved'
    ) {
      return true;
    }

    // Pending residents return to submission status
    if (
      requestSnap.exists() &&
      requestSnap.data()['status'] === 'pending'
    ) {
      return router.createUrlTree(['/registration-submitted']);
    }

    // Residents who haven't submitted verification
    if (
      userData['verificationStatus'] === 'not_submitted' &&
      !requestSnap.exists()
    ) {
      return router.createUrlTree(['/account-confirmation']);
    }

    // Deny all other cases
    return router.createUrlTree(['/login']);

  } catch (error) {
    console.error('Resident guard error:', error);
    return router.createUrlTree(['/login']);
  }
};
