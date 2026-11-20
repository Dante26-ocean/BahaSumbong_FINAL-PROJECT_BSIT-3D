
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// COMMUNITY REPORT STRUCTURE
// =========================================

interface CommunityReport {
  id: string;
  residentId: string;
  problemType: string;
  description: string;
  locationDescription: string;
  status: string;
  createdAt: Date | null;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {

  // =========================================
  // DASHBOARD STATES
  // =========================================

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  // Administrator information
  readonly adminName = signal('Administrator');
  readonly adminEmail = signal('');

  // Community reports
  readonly reports = signal<CommunityReport[]>([]);

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

  // Display only the five latest reports.
  readonly recentReports = computed(
    () => this.reports().slice(0, 5)
  );

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeReports: Unsubscribe | null = null;

  private destroyed = false;

  ngOnInit(): void {
    void this.initializeDashboard();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    // Stop Firestore listener.
    this.unsubscribeReports?.();

    this.unsubscribeReports = null;

  }

  // =========================================
  // INITIALIZE ADMIN DASHBOARD
  // =========================================

  private async initializeDashboard(): Promise<void> {

    try {

      // Wait for Firebase Authentication.
      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in as an administrator.'
        );

        this.isLoading.set(false);
        return;

      }

      // =========================================
      // VERIFY ADMINISTRATOR ACCOUNT
      // =========================================

      const adminRef = doc(
        db,
        'users',
        currentUser.uid
      );

      const adminSnap = await getDocFromServer(
        adminRef
      );

      if (this.destroyed) {
        return;
      }

      if (!adminSnap.exists()) {

        this.errorMessage.set(
          'Administrator account not found.'
        );

        this.isLoading.set(false);
        return;

      }

      const adminData = adminSnap.data();

      // Verify administrator role and UID.
      if (
        adminData['role'] !== 'admin' ||
        adminData['uid'] !== currentUser.uid
      ) {

        this.errorMessage.set(
          'You do not have permission to access this dashboard.'
        );

        this.isLoading.set(false);
        return;

      }

      // =========================================
      // ADMINISTRATOR INFORMATION
      // =========================================

      this.adminName.set(
        typeof adminData['displayName'] === 'string'
          ? adminData['displayName']
          : currentUser.displayName || 'Administrator'
      );

      this.adminEmail.set(
        currentUser.email || ''
      );

      // =========================================
      // LOAD COMMUNITY REPORTS
      // =========================================

      this.subscribeToReports();

    } catch (error) {

      console.error(
        'Error initializing Admin Dashboard:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to initialize the Administrator Dashboard.'
        );

        this.isLoading.set(false);

      }

    }

  }

  // =========================================
  // REAL-TIME REPORT RETRIEVAL
  // =========================================

  private subscribeToReports(): void {

    // Administrators can retrieve all community reports.
    const reportsRef = collection(
      db,
      'reports'
    );

    this.unsubscribeReports = onSnapshot(

      reportsRef,

      (snapshot) => {

        if (this.destroyed) {
          return;
        }

        const allReports: CommunityReport[] =
          snapshot.docs.map((reportDoc) => {

            const data = reportDoc.data();
            const createdAt = data['createdAt'];

            return {

              id: reportDoc.id,

              residentId:
                typeof data['residentId'] === 'string'
                  ? data['residentId']
                  : '',

              problemType:
                typeof data['problemType'] === 'string'
                  ? data['problemType']
                  : 'unknown',

              description:
                typeof data['description'] === 'string'
                  ? data['description']
                  : '',

              locationDescription:
                typeof data['locationDescription'] === 'string'
                  ? data['locationDescription']
                  : '',

              status:
                typeof data['status'] === 'string'
                  ? data['status']
                  : 'unknown',

              createdAt:
                createdAt instanceof Timestamp
                  ? createdAt.toDate()
                  : null

            };

          });

        // =========================================
        // SORT NEWEST TO OLDEST
        // =========================================

        allReports.sort((a, b) => {

          const dateA =
            a.createdAt?.getTime() ?? 0;

          const dateB =
            b.createdAt?.getTime() ?? 0;

          return dateB - dateA;

        });

        // Update reports and statistics.
        this.reports.set(allReports);

        this.errorMessage.set('');
        this.isLoading.set(false);

      },

      (error) => {

        if (this.destroyed) {
          return;
        }

        console.error(
          'Error retrieving dashboard reports:',
          error
        );

        this.reports.set([]);

        if (error.code === 'permission-denied') {

          this.errorMessage.set(
            'Permission denied. Administrator access is required.'
          );

        } else {

          this.errorMessage.set(
            'Unable to retrieve community reports. ' +
            'Please check your connection.'
          );

        }

        this.isLoading.set(false);

      }

    );

  }

}
