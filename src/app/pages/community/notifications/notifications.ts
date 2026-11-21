
import {
  Component,
  NgZone,
  OnInit,
  OnDestroy
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  onAuthStateChanged,
  User,
  Unsubscribe
} from 'firebase/auth';

import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp
} from 'firebase/firestore';

import {
  auth,
  db
} from '../../../firebase';

// ==========================================
// NOTIFICATION TYPES
// ==========================================

export type ReportNotificationStatus =
  | 'in_progress'
  | 'resolved'
  | 'rejected';

// ==========================================
// RESIDENT NOTIFICATION DATA
// ==========================================

export interface ResidentNotification {

  id: string;

  reportId: string;

  problemType: string;

  locationDescription: string;

  status: ReportNotificationStatus;

  statusLabel: string;

  message: string;

  updatedAt: Date | null;

  updatedAtText: string;

  timestamp: number;

}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications implements OnInit, OnDestroy {

  // ==========================================
  // NOTIFICATION STATES
  // ==========================================

  notifications: ResidentNotification[] = [];

  isLoading = true;

  errorMessage = '';

  // ==========================================
  // FIREBASE LISTENERS
  // ==========================================

  private unsubscribeAuth: Unsubscribe | null = null;

  private unsubscribeReports: (() => void) | null = null;

  private currentListenerId = 0;

  private isDestroyed = false;

  constructor(
    private readonly ngZone: NgZone
  ) {}

  // ==========================================
  // INITIALIZE NOTIFICATIONS
  // ==========================================

  ngOnInit(): void {

    this.unsubscribeAuth = onAuthStateChanged(

      auth,

      (user) => {

        this.listenToResidentReports(user);

      },

      (error) => {

        if (this.isDestroyed) {
          return;
        }

        this.currentListenerId++;

        this.stopReportListener();

        console.error(
          'Notification authentication failed:',
          error
        );

        this.ngZone.run(() => {

          this.notifications = [];

          this.isLoading = false;

          this.errorMessage =
            'Unable to verify your account. Please sign in again.';

        });

      }

    );

  }

  // ==========================================
  // LISTEN FOR RESIDENT REPORT UPDATES
  // ==========================================

  private listenToResidentReports(
    user: User | null
  ): void {

    const listenerId = ++this.currentListenerId;

    // Stop previous listener to prevent
    // updates from another account or session.
    this.stopReportListener();

    this.ngZone.run(() => {

      this.notifications = [];

      this.isLoading = true;

      this.errorMessage = '';

    });

    // ======================================
    // CHECK AUTHENTICATION
    // ======================================

    if (!user) {

      this.ngZone.run(() => {

        this.isLoading = false;

        this.errorMessage =
          'Please sign in to view your notifications.';

      });

      return;
    }

    try {

      // ======================================
      // QUERY ONLY RESIDENT'S REPORTS
      // ======================================

      const reportsRef = collection(
        db,
        'reports'
      );

      const residentReportsQuery = query(

        reportsRef,

        where(
          'residentId',
          '==',
          user.uid
        )

      );

      // ======================================
      // REAL-TIME FIRESTORE LISTENER
      // ======================================

      this.unsubscribeReports = onSnapshot(

        residentReportsQuery,

        (snapshot) => {

          if (
            this.isDestroyed ||
            listenerId !== this.currentListenerId
          ) {
            return;
          }

          const notificationList:
            ResidentNotification[] = [];

          // ==================================
          // PROCESS REPORTS
          // ==================================

          snapshot.forEach((reportSnapshot) => {

            const report = reportSnapshot.data();

            // Defense-in-depth ownership check.
            if (report['residentId'] !== user.uid) {
              return;
            }

            const status: unknown = report['status'];

            // Only reports with administrator
            // status updates produce notifications.
            if (
              status !== 'in_progress' &&
              status !== 'resolved' &&
              status !== 'rejected'
            ) {
              return;
            }

            // ==================================
            // REPORT INFORMATION
            // ==================================

            const problemType =
              this.formatProblemType(
                report['problemType']
              );

            const locationDescription =
              typeof report['locationDescription']
                === 'string'
                ? report['locationDescription']
                : '';

            // ==================================
            // NOTIFICATION DATE
            // ==================================

            const updatedAt =
              report['updatedAt'] instanceof Timestamp
                ? report['updatedAt'] as Timestamp
                : null;

            const createdAt =
              report['createdAt'] instanceof Timestamp
                ? report['createdAt'] as Timestamp
                : null;

            const notificationTimestamp =
              updatedAt || createdAt;

            const notificationDate =
              notificationTimestamp
                ? notificationTimestamp.toDate()
                : null;

            const timestamp =
              notificationDate
                ? notificationDate.getTime()
                : 0;

            const updatedAtText =
              notificationDate
                ? notificationDate.toLocaleString()
                : 'Date unavailable';

            // ==================================
            // CREATE NOTIFICATION
            // ==================================

            notificationList.push({

              id: `${reportSnapshot.id}-${status}`,

              reportId: reportSnapshot.id,

              problemType: problemType,

              locationDescription:
                locationDescription,

              status: status,

              statusLabel:
                this.formatReportStatus(status),

              message:
                this.createNotificationMessage(status),

              updatedAt: notificationDate,

              updatedAtText: updatedAtText,

              timestamp: timestamp

            });

          });

          // ==================================
          // SORT NEWEST FIRST
          // ==================================

          notificationList.sort(
            (a, b) => b.timestamp - a.timestamp
          );

          // ==================================
          // UPDATE COMPONENT STATE
          // ==================================

          this.ngZone.run(() => {

            this.notifications = notificationList;

            this.isLoading = false;

            this.errorMessage = '';

          });

        },

        // ==================================
        // FIRESTORE LISTENER ERROR
        // ==================================

        (error) => {

          if (
            this.isDestroyed ||
            listenerId !== this.currentListenerId
          ) {
            return;
          }

          console.error(
            'Failed to retrieve notifications:',
            error
          );

          this.ngZone.run(() => {

            this.notifications = [];

            this.isLoading = false;

            this.errorMessage =
              'Unable to load your notifications. Please check your connection and try again.';

          });

        }

      );

    } catch (error) {

      if (
        this.isDestroyed ||
        listenerId !== this.currentListenerId
      ) {
        return;
      }

      console.error(
        'Unable to start notifications listener:',
        error
      );

      this.ngZone.run(() => {

        this.notifications = [];

        this.isLoading = false;

        this.errorMessage =
          'Unable to load notifications. Please try again.';

      });

    }

  }

  // ==========================================
  // FORMAT REPORT PROBLEM TYPE
  // ==========================================

  private formatProblemType(
    value: unknown
  ): string {

    switch (value) {

      case 'flooding':
        return 'Flooding';

      case 'blocked_drainage':
        return 'Blocked Drainage';

      case 'damaged_drainage':
        return 'Damaged Drainage';

      default:
        return 'Community Report';

    }

  }

  // ==========================================
  // FORMAT REPORT STATUS
  // ==========================================

  private formatReportStatus(
    status: ReportNotificationStatus
  ): string {

    switch (status) {

      case 'in_progress':
        return 'In Progress';

      case 'resolved':
        return 'Resolved';

      case 'rejected':
        return 'Rejected';

    }

  }

  // ==========================================
  // CREATE NOTIFICATION MESSAGE
  // ==========================================

  private createNotificationMessage(
    status: ReportNotificationStatus
  ): string {

    switch (status) {

      case 'in_progress':
        return (
          'Your submitted report is now in progress.'
        );

      case 'resolved':
        return (
          'Your submitted report has been marked as resolved.'
        );

      case 'rejected':
        return (
          'Your submitted report has been rejected.'
        );

    }

  }

  // ==========================================
  // REFRESH NOTIFICATIONS
  // ==========================================

  refreshNotifications(): void {

    if (this.isDestroyed) {
      return;
    }

    this.listenToResidentReports(
      auth.currentUser
    );

  }

  // ==========================================
  // STOP REAL-TIME LISTENER
  // ==========================================

  private stopReportListener(): void {

    if (this.unsubscribeReports) {

      this.unsubscribeReports();

      this.unsubscribeReports = null;

    }

  }

  // ==========================================
  // CLEAN UP ALL LISTENERS
  // ==========================================

  ngOnDestroy(): void {

    this.isDestroyed = true;

    this.currentListenerId++;

    this.stopReportListener();

    if (this.unsubscribeAuth) {

      this.unsubscribeAuth();

      this.unsubscribeAuth = null;

    }

  }

}
