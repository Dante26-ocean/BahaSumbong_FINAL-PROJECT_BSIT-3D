
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import {
  doc,
  getDoc,
  getFirestore
} from 'firebase/firestore';

import { auth } from '../firebase';

export const adminGuard: CanActivateFn = async () => {

  const router = inject(Router);

  try {
    // Step 1: Wait for Firebase Authentication
    await auth.authStateReady();

    const user = auth.currentUser;

    // Step 2: Check if a user is logged in
    if (!user) {
      return router.createUrlTree(['/login']);
    }

    // Step 3: Get the user's Firestore profile
    const db = getFirestore(auth.app);
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    // Step 4: Verify administrator role
    if (
      userSnap.exists() &&
      userSnap.data()['role'] === 'admin' &&
      userSnap.data()['uid'] === user.uid
    ) {
      return true;
    }

    // Step 5: Deny access to non-admin users
    return router.createUrlTree(['/login']);

  } catch (error) {
    console.error('Admin guard error:', error);
    return router.createUrlTree(['/login']);
  }
};
