
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { signOut } from 'firebase/auth';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// RESIDENT PROFILE STRUCTURE
// =========================================

interface ResidentProfile {
  displayName: string;
  email: string;
  verificationStatus: string;
}

// =========================================
// RESIDENT REPORT STRUCTURE
// =========================================

interface ResidentReport {
  id: string;
  problemType: string;
  description: string;
  locationDescription: string;
  status: string;
  createdAt: Date | null;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {

  // =========================================
  // RESIDENT INFORMATION
  // =========================================

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  readonly resident = signal<ResidentProfile | null>(
    null
  );

  // =========================================
  // FIRESTORE REPORTS
  // =========================================

  readonly reports = signal<ResidentReport[]>([]);

  readonly reportsLoading = signal(true);
  readonly reportsError = signal('');

  // =========================================
  // REPORT STATISTICS
  // =========================================

  readonly totalReports = computed(
    () => this.reports().length
  );

  readonly pendingReports = computed(
    () => this.reports().filter(
      report => report.status === 'pending'
    ).length
  );

  readonly inProgressReports = computed(
    () => this.reports().filter(
      report => report.status === 'in_progress'
    ).length
  );

  readonly resolvedReports = computed(
    () => this.reports().filter(
      report => report.status === 'resolved'
    ).length
  );

  readonly rejectedReports = computed(
    () => this.reports().filter(
      report => report.status === 'rejected'
    ).length
  );

  // Display the five most recent reports.
  readonly recentReports = computed(
    () => this.reports().slice(0, 5)
  );

  // =========================================
  // RESIDENT SIGN-OUT STATES
  // =========================================

  readonly isSigningOut = signal(false);
  readonly signOutError = signal('');

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeReports: Unsubscribe | null = null;

  private destroyed = false;

  constructor(
    private readonly router: Router
  ) {}

  // =========================================
  // COMPONENT INITIALIZATION
  // =========================================

  ngOnInit(): void {
    void this.initializeDashboard();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    this.unsubscribeReports?.();
    this.unsubscribeReports = null;

  }

  // =========================================
  // INITIALIZE COMMUNITY DASHBOARD
  // =========================================

  private async initializeDashboard(): Promise<void> {

    try {

      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in to continue.'
        );

        return;
      }

      // =====================================
      // RETRIEVE RESIDENT PROFILE
      // =====================================

      const userRef = doc(
        db,
        'users',
        currentUser.uid
      );

      const userSnap = await getDocFromServer(
        userRef
      );

      if (this.destroyed) {
        return;
      }

      if (!userSnap.exists()) {

        this.errorMessage.set(
          'Resident profile not found.'
        );

        return;
      }

      const userData = userSnap.data();

      // =====================================
      // VERIFY RESIDENT ACCOUNT
      // =====================================

      if (
        userData['role'] !== 'resident' ||
        userData['verificationStatus'] !== 'approved'
      ) {

        this.errorMessage.set(
          'Your account is not approved for community access.'
        );

        return;
      }

      // =====================================
      // READ DISPLAY NAME FROM FIRESTORE
      // =====================================

      const firestoreDisplayName =
        typeof userData['displayName'] === 'string'
          ? userData['displayName'].trim()
          : '';

      const googleDisplayName =
        currentUser.displayName?.trim() || '';

      const displayName =
        firestoreDisplayName ||
        googleDisplayName ||
        'Resident';

      // =====================================
      // STORE RESIDENT INFORMATION
      // =====================================

      this.resident.set({

        displayName,

        email:
          currentUser.email || 'No email available',

        verificationStatus:
          userData['verificationStatus']

      });

      // =====================================
      // LOAD RESIDENT REPORTS
      // =====================================

      this.subscribeToResidentReports(
        currentUser.uid
      );

    } catch (error) {

      console.error(
        'Error initializing Community Dashboard:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to load your account information.'
        );

      }

    } finally {

      if (!this.destroyed) {
        this.isLoading.set(false);
      }

    }

  }

  // =========================================
  // REAL-TIME RESIDENT REPORTS
  // =========================================

  private subscribeToResidentReports(
    residentId: string
  ): void {

    this.reportsLoading.set(true);
    this.reportsError.set('');

    const reportsQuery = query(

      collection(db, 'reports'),

      where('residentId', '==', residentId)

    );

    this.unsubscribeReports = onSnapshot(

      reportsQuery,

      (snapshot) => {

        if (this.destroyed) {
          return;
        }

        const residentReports: ResidentReport[] =
          snapshot.docs.map((reportDoc) => {

            const data = reportDoc.data();
            const createdAtValue = data['createdAt'];

            return {

              id: reportDoc.id,

              problemType:
                data['problemType'] || 'unknown',

              description:
                data['description'] || '',

              locationDescription:
                data['locationDescription'] || '',

              status:
                data['status'] || 'unknown',

              createdAt:
                createdAtValue instanceof Timestamp
                  ? createdAtValue.toDate()
                  : null

            };

          });

        // =====================================
        // SORT NEWEST REPORTS FIRST
        // =====================================

        residentReports.sort((a, b) => {

          const dateA =
            a.createdAt?.getTime() ?? 0;

          const dateB =
            b.createdAt?.getTime() ?? 0;

          return dateB - dateA;

        });

        this.reports.set(residentReports);

        this.reportsLoading.set(false);
        this.reportsError.set('');

      },

      (error) => {

        if (this.destroyed) {
          return;
        }

        console.error(
          'Error loading resident reports:',
          error
        );

        this.reportsError.set(
          'Unable to load your reports. ' +
          'Please check your connection or permissions.'
        );

        this.reportsLoading.set(false);

      }

    );

  }

  // =========================================
  // COMMUNITY NOTIFICATIONS NAVIGATION
  // =========================================

  goToNotifications(): void {

    void this.router.navigate([
      '/community/notifications'
    ]);

  }

  // =========================================
  // COMMUNITY PROFILE NAVIGATION
  // =========================================

  goToProfile(): void {

    void this.router.navigate([
      '/community/profile'
    ]);

  }

  // =========================================
  // CREATE REPORT NAVIGATION
  // =========================================

  goToCreateReport(): void {

    void this.router.navigate([
      '/community/create-report'
    ]);

  }

  // =========================================
  // MY REPORTS NAVIGATION
  // =========================================

  goToMyReports(): void {

    void this.router.navigate([
      '/community/my-reports'
    ]);

  }

  // =========================================
  // COMMUNITY MAP NAVIGATION
  // =========================================

  goToCommunityMap(): void {

    void this.router.navigate([
      '/community/map'
    ]);

  }

  // =========================================
  // STEP 101.4 - HELP CENTER NAVIGATION
  // =========================================

  goToHelpCenter(): void {

    void this.router.navigate([
      '/community/help-center'
    ]);

  }

  // =========================================
  // RESIDENT SIGN OUT
  // =========================================

  async signOutResident(): Promise<void> {

    if (this.isSigningOut()) {
      return;
    }

    this.isSigningOut.set(true);
    this.signOutError.set('');

    try {

      await signOut(auth);

      this.unsubscribeReports?.();
      this.unsubscribeReports = null;

    } catch (error) {

      console.error(
        'Resident sign-out failed:',
        error
      );

      if (!this.destroyed) {

        this.signOutError.set(
          'Unable to sign out. Please try again.'
        );

        this.isSigningOut.set(false);

      }

      return;

    }

    try {

      await this.router.navigate(['/login']);

    } catch (error) {

      console.error(
        'Unable to navigate to login:',
        error
      );

      if (!this.destroyed) {

        this.signOutError.set(
          'You have been signed out, but the login page could not be opened.'
        );

      }

    } finally {

      if (!this.destroyed) {
        this.isSigningOut.set(false);
      }

    }

  }

}
