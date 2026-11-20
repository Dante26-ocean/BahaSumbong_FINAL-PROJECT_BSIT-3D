
import {
  Component,
  OnInit,
  OnDestroy,
  signal
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// Structure of a community report.
interface CommunityReport {
  id: string;
  problemType: string;
  description: string;
  locationDescription: string;
  status: string;
  createdAt: Date | null;
}

@Component({
  selector: 'app-my-reports',
  imports: [DatePipe, RouterLink],
  templateUrl: './my-reports.html',
  styleUrl: './my-reports.css',
})
export class MyReports implements OnInit, OnDestroy {

  // Reports retrieved from Firestore.
  readonly reports = signal<CommunityReport[]>([]);

  // Loading and error states.
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  // Firestore listener.
  private unsubscribeReports: Unsubscribe | null = null;

  private destroyed = false;

  ngOnInit(): void {
    void this.loadMyReports();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    // Stop listening when leaving this page.
    this.unsubscribeReports?.();

  }

  private async loadMyReports(): Promise<void> {

    try {

      // Wait for Firebase Authentication.
      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'Please sign in to view your reports.'
        );

        this.isLoading.set(false);

        return;
      }

      // Query reports belonging to this resident only.
      const reportsQuery = query(
        collection(db, 'reports'),
        where('residentId', '==', currentUser.uid)
      );

      // Listen for real-time Firestore updates.
      this.unsubscribeReports = onSnapshot(

        reportsQuery,

        (snapshot) => {

          if (this.destroyed) {
            return;
          }

          const myReports: CommunityReport[] =
            snapshot.docs.map((reportDoc) => {

              const data = reportDoc.data();
              const timestamp = data['createdAt'];

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
                  timestamp instanceof Timestamp
                    ? timestamp.toDate()
                    : null

              };

            });

          // Sort reports from newest to oldest.
          myReports.sort((a, b) => {

            const dateA =
              a.createdAt?.getTime() ?? 0;

            const dateB =
              b.createdAt?.getTime() ?? 0;

            return dateB - dateA;

          });

          this.reports.set(myReports);

          this.errorMessage.set('');
          this.isLoading.set(false);

        },

        (error) => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error retrieving My Reports:',
            error
          );

          this.errorMessage.set(
            'Unable to retrieve your reports. ' +
            'Please check your connection or permissions.'
          );

          this.isLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing My Reports:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Something went wrong while loading your reports.'
        );

        this.isLoading.set(false);

      }

    }

  }

}
