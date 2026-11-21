
import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  signal
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';

// =========================================
// SUPPORT REQUEST TYPES
// =========================================

type SupportStatus =
  | 'open'
  | 'in_progress'
  | 'resolved';

type SupportFilter =
  | 'all'
  | SupportStatus;

interface SupportRequest {
  id: string;
  residentId: string;
  topic: string;
  subject: string;
  message: string;
  status: SupportStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

@Component({
  selector: 'app-support-requests',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule
  ],
  templateUrl: './support-requests.html',
  styleUrl: './support-requests.css'
})
export class SupportRequests
  implements OnInit, OnDestroy {

  // =========================================
  // PAGE STATES
  // =========================================

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly requests = signal<SupportRequest[]>([]);

  readonly selectedRequestId = signal<string | null>(
    null
  );

  readonly updatingRequestId = signal<string | null>(
    null
  );

  private unsubscribeRequests: Unsubscribe | null = null;
  private destroyed = false;

  // =========================================
  // FILTER OPTIONS
  // =========================================

  readonly statusFilters: {
    value: SupportFilter;
    label: string;
  }[] = [
    { value: 'all', label: 'All Requests' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' }
  ];

  readonly selectedFilter =
    signal<SupportFilter>('all');

  // =========================================
  // SUPPORT TOPIC LABELS
  // =========================================

  readonly topicLabels: Record<string, string> = {
    general: 'General Inquiry',
    account: 'Account and Login',
    verification: 'Account Verification',
    reports: 'Community Reports',
    technical: 'Technical Problem'
  };

  // =========================================
  // STATISTICS
  // =========================================

  readonly totalRequests = computed(
    () => this.requests().length
  );

  readonly openRequests = computed(
    () => this.requests().filter(
      request => request.status === 'open'
    ).length
  );

  readonly inProgressRequests = computed(
    () => this.requests().filter(
      request => request.status === 'in_progress'
    ).length
  );

  readonly resolvedRequests = computed(
    () => this.requests().filter(
      request => request.status === 'resolved'
    ).length
  );

  // =========================================
  // FILTERED SUPPORT REQUESTS
  // =========================================

  readonly filteredRequests = computed(() => {

    const filter = this.selectedFilter();

    if (filter === 'all') {
      return this.requests();
    }

    return this.requests().filter(
      request => request.status === filter
    );

  });

  // =========================================
  // SELECTED SUPPORT REQUEST
  // =========================================

  readonly selectedRequest = computed(() => {

    const selectedId = this.selectedRequestId();

    if (!selectedId) {
      return null;
    }

    return this.requests().find(
      request => request.id === selectedId
    ) ?? null;

  });

  // =========================================
  // COMPONENT LIFECYCLE
  // =========================================

  ngOnInit(): void {
    void this.initializeSupportRequests();
  }

  ngOnDestroy(): void {

    this.destroyed = true;

    this.unsubscribeRequests?.();
    this.unsubscribeRequests = null;

  }

  // =========================================
  // INITIALIZE SUPPORT REQUESTS
  // =========================================

  private async initializeSupportRequests():
    Promise<void> {

    try {

      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      if (!auth.currentUser) {

        this.errorMessage.set(
          'Please sign in as an administrator.'
        );

        this.isLoading.set(false);
        return;

      }

      this.subscribeToSupportRequests();

    } catch (error) {

      console.error(
        'Unable to initialize support requests:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to initialize the support inbox.'
        );

        this.isLoading.set(false);

      }

    }

  }

  // =========================================
  // REAL-TIME FIRESTORE LISTENER
  // =========================================

  private subscribeToSupportRequests(): void {

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.unsubscribeRequests?.();

    const requestsCollection = collection(
      db,
      'supportRequests'
    );

    this.unsubscribeRequests = onSnapshot(

      requestsCollection,

      (snapshot) => {

        if (this.destroyed) {
          return;
        }

        const supportRequests: SupportRequest[] =
          snapshot.docs.map(requestDoc => {

            const data = requestDoc.data();

            const statusValue = data['status'];

            const status: SupportStatus =
              statusValue === 'resolved'
                ? 'resolved'
                : statusValue === 'in_progress'
                  ? 'in_progress'
                  : 'open';

            return {
              id: requestDoc.id,

              residentId:
                typeof data['residentId'] === 'string'
                  ? data['residentId']
                  : '',

              topic:
                typeof data['topic'] === 'string'
                  ? data['topic']
                  : 'general',

              subject:
                typeof data['subject'] === 'string'
                  ? data['subject']
                  : '',

              message:
                typeof data['message'] === 'string'
                  ? data['message']
                  : '',

              status,

              createdAt:
                data['createdAt'] instanceof Timestamp
                  ? data['createdAt'].toDate()
                  : null,

              updatedAt:
                data['updatedAt'] instanceof Timestamp
                  ? data['updatedAt'].toDate()
                  : null
            };

          });

        // =====================================
        // NEWEST REQUESTS FIRST
        // =====================================

        supportRequests.sort((a, b) => {

          const dateA =
            a.createdAt?.getTime() ?? 0;

          const dateB =
            b.createdAt?.getTime() ?? 0;

          return dateB - dateA;

        });

        this.requests.set(supportRequests);
        this.isLoading.set(false);
        this.errorMessage.set('');

        // Clear a selection if its document
        // is no longer available.
        const selectedId = this.selectedRequestId();

        if (
          selectedId &&
          !supportRequests.some(
            request => request.id === selectedId
          )
        ) {
          this.selectedRequestId.set(null);
        }

      },

      (error) => {

        if (this.destroyed) {
          return;
        }

        console.error(
          'Unable to load support requests:',
          error
        );

        this.errorMessage.set(
          'Unable to load support requests. ' +
          'Please check administrator permissions and your connection.'
        );

        this.isLoading.set(false);

      }

    );

  }

  // =========================================
  // FILTER REQUESTS
  // =========================================

  selectFilter(filter: SupportFilter): void {

    if (
      !this.statusFilters.some(
        option => option.value === filter
      )
    ) {
      return;
    }

    this.selectedFilter.set(filter);

  }

  // =========================================
  // VIEW REQUEST DETAILS
  // =========================================

  viewRequest(requestId: string): void {

    const exists = this.requests().some(
      request => request.id === requestId
    );

    if (!exists) {
      return;
    }

    this.selectedRequestId.set(requestId);

    this.errorMessage.set('');
    this.successMessage.set('');

  }

  closeRequestDetails(): void {

    this.selectedRequestId.set(null);

  }

  // =========================================
  // GET SUPPORT TOPIC LABEL
  // =========================================

  getTopicLabel(topic: string): string {

    return this.topicLabels[topic] ?? topic;

  }

  // =========================================
  // CHECK ALLOWED STATUS TRANSITIONS
  // =========================================

  private canChangeStatus(
    currentStatus: string,
    nextStatus: SupportStatus
  ): boolean {

    if (currentStatus === 'open') {

      return nextStatus === 'in_progress'
        || nextStatus === 'resolved';

    }

    if (currentStatus === 'in_progress') {

      return nextStatus === 'resolved';

    }

    return false;

  }

  // =========================================
  // UPDATE SUPPORT REQUEST STATUS
  // =========================================

  async updateRequestStatus(
    requestId: string,
    nextStatus: SupportStatus
  ): Promise<void> {

    if (this.updatingRequestId()) {
      return;
    }

    const request = this.requests().find(
      item => item.id === requestId
    );

    if (!request) {

      this.errorMessage.set(
        'The selected support request was not found.'
      );

      return;

    }

    if (!this.canChangeStatus(
      request.status,
      nextStatus
    )) {

      this.errorMessage.set(
        'This status change is not allowed.'
      );

      return;

    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.updatingRequestId.set(requestId);

    try {

      await auth.authStateReady();

      if (!auth.currentUser) {

        throw new Error(
          'Administrator session is unavailable.'
        );

      }

      const requestRef = doc(
        db,
        'supportRequests',
        requestId
      );

      // =====================================
      // ATOMIC STATUS UPDATE
      // =====================================

      await runTransaction(
        db,
        async transaction => {

          const requestSnapshot =
            await transaction.get(requestRef);

          if (!requestSnapshot.exists()) {

            throw new Error(
              'Support request no longer exists.'
            );

          }

          const currentStatus =
            requestSnapshot.data()['status'];

          if (
            !this.canChangeStatus(
              currentStatus,
              nextStatus
            )
          ) {

            throw new Error(
              'The request status has changed. ' +
              'Please review its current status.'
            );

          }

          transaction.update(requestRef, {

            status: nextStatus,

            updatedAt: serverTimestamp()

          });

        }
      );

      if (!this.destroyed) {

        this.successMessage.set(
          'Support request status updated successfully.'
        );

      }

    } catch (error) {

      console.error(
        'Unable to update support request:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to update the support request. ' +
          'Please check its current status and try again.'
        );

      }

    } finally {

      if (!this.destroyed) {

        this.updatingRequestId.set(null);

      }

    }

  }

}
