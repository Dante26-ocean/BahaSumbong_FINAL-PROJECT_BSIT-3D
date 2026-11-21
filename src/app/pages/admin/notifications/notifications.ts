
import {
  Component,
  NgZone,
  OnInit,
  OnDestroy
} from '@angular/core';

import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import {
  onAuthStateChanged,
  User
} from 'firebase/auth';

import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  Timestamp
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// ==========================================
// ADMINISTRATOR NOTIFICATION TYPES
// ==========================================

export type AdminNotificationType =
  | 'verification_request'
  | 'community_report'
  | 'support_request';

// ==========================================
// ADMINISTRATOR NOTIFICATION INTERFACE
// ==========================================

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  referenceId: string;
  title: string;
  message: string;
  date: Date | null;
  dateText: string;
  timestamp: number;
  targetRoute: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule
  ],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications implements OnInit, OnDestroy {

  // ==========================================
  // NOTIFICATION STATE
  // ==========================================

  notifications: AdminNotification[] = [];

  isLoading = true;

  isAuthorized = false;

  errorMessage = '';

  pendingVerificationCount = 0;

  pendingReportCount = 0;

  pendingSupportCount = 0;

  // ==========================================
  // REAL-TIME SOURCE DATA
  // ==========================================

  private verificationNotifications:
    AdminNotification[] = [];

  private reportNotifications:
    AdminNotification[] = [];

  private supportNotifications:
    AdminNotification[] = [];

  private verificationLoaded = false;

  private reportsLoaded = false;

  private supportLoaded = false;

  // ==========================================
  // FIREBASE LISTENERS
  // ==========================================

  private unsubscribeAuth:
    (() => void) | null = null;

  private unsubscribeVerifications:
    (() => void) | null = null;

  private unsubscribeReports:
    (() => void) | null = null;

  private unsubscribeSupport:
    (() => void) | null = null;

  private currentLoadId = 0;

  private isDestroyed = false;

  constructor(
    private readonly ngZone: NgZone
  ) {}

  // ==========================================
  // INITIALIZE ADMINISTRATOR NOTIFICATIONS
  // ==========================================

  ngOnInit(): void {

    this.unsubscribeAuth = onAuthStateChanged(
      auth,

      (user) => {
        void this.initializeNotifications(user);
      },

      (error) => {

        if (this.isDestroyed) {
          return;
        }

        this.currentLoadId++;

        this.stopFirestoreListeners();

        console.error(
          'Administrator authentication error:',
          error
        );

        this.ngZone.run(() => {

          this.notifications = [];

          this.verificationNotifications = [];
          this.reportNotifications = [];
          this.supportNotifications = [];

          this.pendingVerificationCount = 0;
          this.pendingReportCount = 0;
          this.pendingSupportCount = 0;

          this.isLoading = false;
          this.isAuthorized = false;

          this.errorMessage =
            'Unable to verify your administrator account.';

        });

      }
    );

  }

  // ==========================================
  // VERIFY ADMINISTRATOR ACCESS
  // ==========================================

  private async initializeNotifications(
    user: User | null
  ): Promise<void> {

    const loadId = ++this.currentLoadId;

    this.stopFirestoreListeners();

    this.ngZone.run(() => {

      this.notifications = [];

      this.verificationNotifications = [];
      this.reportNotifications = [];
      this.supportNotifications = [];

      this.verificationLoaded = false;
      this.reportsLoaded = false;
      this.supportLoaded = false;

      this.pendingVerificationCount = 0;
      this.pendingReportCount = 0;
      this.pendingSupportCount = 0;

      this.isLoading = true;
      this.isAuthorized = false;
      this.errorMessage = '';

    });

    // ======================================
    // CHECK FIREBASE AUTHENTICATION
    // ======================================

    if (!user) {

      this.ngZone.run(() => {

        this.isLoading = false;

        this.errorMessage =
          'Please sign in as an administrator.';

      });

      return;
    }

    try {

      // ======================================
      // RETRIEVE ADMINISTRATOR PROFILE
      // ======================================

      const adminRef = doc(
        db,
        'users',
        user.uid
      );

      const adminSnapshot =
        await getDocFromServer(adminRef);

      // Ignore outdated authentication requests.
      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      if (!adminSnapshot.exists()) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'Administrator account not found.';

        });

        return;
      }

      // ======================================
      // VALIDATE ADMINISTRATOR ROLE
      // ======================================

      const adminData = adminSnapshot.data();

      const isValidAdministrator =
        adminData['uid'] === user.uid &&
        adminData['role'] === 'admin';

      if (!isValidAdministrator) {

        this.ngZone.run(() => {

          this.isLoading = false;

          this.errorMessage =
            'Administrator access is required.';

        });

        return;
      }

      // ======================================
      // AUTHORIZE ADMINISTRATOR
      // ======================================

      this.ngZone.run(() => {

        this.isAuthorized = true;
        this.errorMessage = '';

      });

      // ======================================
      // START REAL-TIME NOTIFICATIONS
      // ======================================

      this.listenToVerificationRequests(loadId);

      this.listenToCommunityReports(loadId);

      // Step 106.1:
      this.listenToSupportRequests(loadId);

    } catch (error) {

      if (
        this.isDestroyed ||
        loadId !== this.currentLoadId
      ) {
        return;
      }

      this.stopFirestoreListeners();

      console.error(
        'Failed to initialize admin notifications:',
        error
      );

      this.ngZone.run(() => {

        this.isLoading = false;
        this.isAuthorized = false;

        this.errorMessage =
          'Unable to load administrator notifications.';

      });

    }

  }

  // ==========================================
  // LISTEN FOR VERIFICATION REQUESTS
  // ==========================================

  private listenToVerificationRequests(
    loadId: number
  ): void {

    const verificationQuery = query(
      collection(db, 'verificationRequests'),
      where('status', '==', 'pending')
    );

    this.unsubscribeVerifications = onSnapshot(

      verificationQuery,

      (snapshot) => {

        if (
          this.isDestroyed ||
          loadId !== this.currentLoadId
        ) {
          return;
        }

        const notifications:
          AdminNotification[] = [];

        snapshot.forEach((requestSnapshot) => {

          const data = requestSnapshot.data();

          if (data['status'] !== 'pending') {
            return;
          }

          if (data['uid'] !== requestSnapshot.id) {
            return;
          }

          // ==================================
          // VERIFICATION SUBMISSION DATE
          // ==================================

          const submittedAt =
            data['submittedAt'] instanceof Timestamp
              ? data['submittedAt'] as Timestamp
              : null;

          const date = submittedAt
            ? submittedAt.toDate()
            : null;

          // ==================================
          // CREATE ADMIN NOTIFICATION
          // ==================================

          notifications.push({

            id: `verification-${requestSnapshot.id}`,

            type: 'verification_request',

            referenceId: requestSnapshot.id,

            title: 'New Resident Verification Request',

            message:
              'A resident has submitted an account verification request awaiting administrator review.',

            date,

            dateText: date
              ? date.toLocaleString()
              : 'Date unavailable',

            timestamp: date
              ? date.getTime()
              : 0,

            targetRoute: '/admin/verification-requests'

          });

        });

        this.ngZone.run(() => {

          this.verificationNotifications = notifications;

          this.verificationLoaded = true;

          this.updateNotificationList();

        });

      },

      (error) => {
        this.handleListenerError(error, loadId);
      }

    );

  }

  // ==========================================
  // LISTEN FOR COMMUNITY REPORTS
  // ==========================================

  private listenToCommunityReports(
    loadId: number
  ): void {

    const reportsQuery = query(
      collection(db, 'reports'),
      where('status', '==', 'pending')
    );

    this.unsubscribeReports = onSnapshot(

      reportsQuery,

      (snapshot) => {

        if (
          this.isDestroyed ||
          loadId !== this.currentLoadId
        ) {
          return;
        }

        const notifications:
          AdminNotification[] = [];

        snapshot.forEach((reportSnapshot) => {

          const data = reportSnapshot.data();

          if (data['status'] !== 'pending') {
            return;
          }

          // ==================================
          // PROBLEM TYPE
          // ==================================

          const problemType =
            this.formatProblemType(
              data['problemType']
            );

          // ==================================
          // REPORT SUBMISSION DATE
          // ==================================

          const createdAt =
            data['createdAt'] instanceof Timestamp
              ? data['createdAt'] as Timestamp
              : null;

          const date = createdAt
            ? createdAt.toDate()
            : null;

          // ==================================
          // REPORT LOCATION
          // ==================================

          const location =
            typeof data['locationDescription'] === 'string'
              ? data['locationDescription']
              : '';

          const message = location
            ? `A ${problemType.toLowerCase()} report was submitted at ${location}.`
            : `A new ${problemType.toLowerCase()} report is pending review.`;

          // ==================================
          // CREATE ADMIN NOTIFICATION
          // ==================================

          notifications.push({

            id: `report-${reportSnapshot.id}`,

            type: 'community_report',

            referenceId: reportSnapshot.id,

            title: 'New Community Report',

            message,

            date,

            dateText: date
              ? date.toLocaleString()
              : 'Date unavailable',

            timestamp: date
              ? date.getTime()
              : 0,

            targetRoute: '/admin/reports'

          });

        });

        this.ngZone.run(() => {

          this.reportNotifications = notifications;

          this.reportsLoaded = true;

          this.updateNotificationList();

        });

      },

      (error) => {
        this.handleListenerError(error, loadId);
      }

    );

  }

  // ==========================================
  // STEP 106.1 - LISTEN FOR SUPPORT REQUESTS
  // ==========================================

  private listenToSupportRequests(
    loadId: number
  ): void {

    // Only new/open support requests appear
    // in administrator pending notifications.

    const supportQuery = query(
      collection(db, 'supportRequests'),
      where('status', '==', 'open')
    );

    this.unsubscribeSupport = onSnapshot(

      supportQuery,

      (snapshot) => {

        if (
          this.isDestroyed ||
          loadId !== this.currentLoadId
        ) {
          return;
        }

        const notifications:
          AdminNotification[] = [];

        snapshot.forEach((supportSnapshot) => {

          const data = supportSnapshot.data();

          if (data['status'] !== 'open') {
            return;
          }

          // ==================================
          // SUPPORT REQUEST SUBMISSION DATE
          // ==================================

          const createdAt =
            data['createdAt'] instanceof Timestamp
              ? data['createdAt'] as Timestamp
              : null;

          const date = createdAt
            ? createdAt.toDate()
            : null;

          // ==================================
          // SUPPORT REQUEST SUBJECT
          // ==================================

          const subject =
            typeof data['subject'] === 'string'
              ? data['subject'].trim()
              : '';

          // ==================================
          // CREATE SUPPORT NOTIFICATION
          // ==================================

          notifications.push({

            id: `support-${supportSnapshot.id}`,

            type: 'support_request',

            referenceId: supportSnapshot.id,

            title: 'New Support Request',

            message: subject
              ? `A resident submitted a support request: ${subject}`
              : 'A resident submitted a support request awaiting review.',

            date,

            dateText: date
              ? date.toLocaleString()
              : 'Date unavailable',

            timestamp: date
              ? date.getTime()
              : 0,

            targetRoute: '/admin/support-requests'

          });

        });

        this.ngZone.run(() => {

          this.supportNotifications = notifications;

          this.supportLoaded = true;

          this.updateNotificationList();

        });

      },

      (error) => {
        this.handleListenerError(error, loadId);
      }

    );

  }

  // ==========================================
  // FORMAT COMMUNITY REPORT TYPE
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
        return 'Community';

    }

  }

  // ==========================================
  // COMBINE ALL THREE NOTIFICATION SOURCES
  // ==========================================

  private updateNotificationList(): void {

    if (
      !this.verificationLoaded ||
      !this.reportsLoaded ||
      !this.supportLoaded
    ) {
      return;
    }

    const combinedNotifications = [

      ...this.verificationNotifications,

      ...this.reportNotifications,

      ...this.supportNotifications

    ];

    // Show newest items first.
    combinedNotifications.sort(
      (a, b) => b.timestamp - a.timestamp
    );

    // Update each notification count.
    this.pendingVerificationCount =
      this.verificationNotifications.length;

    this.pendingReportCount =
      this.reportNotifications.length;

    this.pendingSupportCount =
      this.supportNotifications.length;

    this.notifications = combinedNotifications;

    this.isLoading = false;

    this.errorMessage = '';

  }

  // ==========================================
  // FIRESTORE LISTENER ERROR HANDLING
  // ==========================================

  private handleListenerError(
    error: unknown,
    loadId: number
  ): void {

    if (
      this.isDestroyed ||
      loadId !== this.currentLoadId
    ) {
      return;
    }

    console.error(
      'Administrator notification listener error:',
      error
    );

    // Invalidate callbacks from all previous listeners.
    this.currentLoadId++;

    this.stopFirestoreListeners();

    this.ngZone.run(() => {

      this.notifications = [];

      this.verificationNotifications = [];
      this.reportNotifications = [];
      this.supportNotifications = [];

      this.verificationLoaded = false;
      this.reportsLoaded = false;
      this.supportLoaded = false;

      this.pendingVerificationCount = 0;
      this.pendingReportCount = 0;
      this.pendingSupportCount = 0;

      this.isLoading = false;

      this.errorMessage =
        'Unable to retrieve notifications. Please check your connection or permissions.';

    });

  }

  // ==========================================
  // REFRESH ADMINISTRATOR NOTIFICATIONS
  // ==========================================

  refreshNotifications(): void {

    if (this.isDestroyed) {
      return;
    }

    void this.initializeNotifications(
      auth.currentUser
    );

  }

  // ==========================================
  // STOP FIRESTORE LISTENERS
  // ==========================================

  private stopFirestoreListeners(): void {

    this.unsubscribeVerifications?.();
    this.unsubscribeVerifications = null;

    this.unsubscribeReports?.();
    this.unsubscribeReports = null;

    this.unsubscribeSupport?.();
    this.unsubscribeSupport = null;

  }

  // ==========================================
  // CLEAN UP COMPONENT LISTENERS
  // ==========================================

  ngOnDestroy(): void {

    this.isDestroyed = true;

    this.currentLoadId++;

    this.stopFirestoreListeners();

    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;

  }

}
