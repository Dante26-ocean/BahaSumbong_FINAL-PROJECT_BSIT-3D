
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed
} from '@angular/core';

import { DatePipe } from '@angular/common';

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

interface ResidentProfile {
  displayName: string;
  email: string;
  verificationStatus: string;
}

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

  // Resident information
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly resident = signal<ResidentProfile | null>(null);

  // Firestore reports
  readonly reports = signal<ResidentReport[]>([]);
  readonly reportsLoading = signal(true);
  readonly reportsError = signal('');

  // Dashboard statistics
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

  // Store the Firestore listener for cleanup.
  private unsubscribeReports: Unsubscribe | null = null;
  private destroyed = false;

  ngOnInit(): void {
    void this.initializeDashboard();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unsubscribeReports?.();
  }

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
          'Please sign in to continue.'
        );
        return;
      }

      // Retrieve the resident's Firestore profile.
      const userRef = doc(
        db,
        'users',
        currentUser.uid
      );

      const userSnap = await getDocFromServer(userRef);

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

      // Verify resident role and approval status.
      if (
        userData['role'] !== 'resident' ||
        userData['verificationStatus'] !== 'approved'
      ) {

        this.errorMessage.set(
          'Your account is not approved for community access.'
        );

        return;
      }

      // Preserve resident information functionality.
      this.resident.set({
        displayName:
          currentUser.displayName?.trim() || 'Resident',

        email:
          currentUser.email || 'No email available',

        verificationStatus:
          userData['verificationStatus']
      });

      // Start retrieving this resident's reports.
      this.subscribeToResidentReports(currentUser.uid);

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

  private subscribeToResidentReports(
    residentId: string
  ): void {

    this.reportsLoading.set(true);
    this.reportsError.set('');

    // Retrieve only reports owned by this resident.
    const reportsQuery = query(
      collection(db, 'reports'),
      where('residentId', '==', residentId)
    );

    // Listen for real-time Firestore changes.
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

        // Sort newest reports first.
        residentReports.sort((a, b) => {

          const dateA = a.createdAt?.getTime() ?? 0;
          const dateB = b.createdAt?.getTime() ?? 0;

          return dateB - dateA;

        });

        // Update reports and dashboard statistics.
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

}
