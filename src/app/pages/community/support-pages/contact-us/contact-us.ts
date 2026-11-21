
import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  signal
} from '@angular/core';

import {
  DatePipe
} from '@angular/common';

import {
  FormsModule,
  NgForm
} from '@angular/forms';

import {
  RouterLink
} from '@angular/router';

import {
  MatIconModule
} from '@angular/material/icon';

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  where
} from 'firebase/firestore';

import { auth, db } from '../../../../firebase';

// =========================================
// SUPPORT TOPIC STRUCTURE
// =========================================

interface SupportTopic {
  value: string;
  label: string;
}

// =========================================
// RESIDENT SUPPORT REQUEST STRUCTURE
// =========================================

type SupportStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'unknown';

interface ResidentSupportRequest {
  id: string;
  residentId: string;
  topic: string;
  subject: string;
  message: string;
  status: SupportStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// =========================================
// CONTACT US COMPONENT
// =========================================

@Component({
  selector: 'app-contact-us',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    DatePipe
  ],
  templateUrl: './contact-us.html',
  styleUrl: './contact-us.css',
})
export class ContactUs implements OnInit, OnDestroy {

  // =========================================
  // SUPPORT TOPICS
  // =========================================

  readonly topics: SupportTopic[] = [
    {
      value: 'general',
      label: 'General Inquiry'
    },
    {
      value: 'account',
      label: 'Account and Login'
    },
    {
      value: 'verification',
      label: 'Account Verification'
    },
    {
      value: 'reports',
      label: 'Community Reports'
    },
    {
      value: 'technical',
      label: 'Technical Problem'
    }
  ];

  // =========================================
  // FORM VALUES
  // =========================================

  topic = 'general';

  subject = '';

  message = '';

  // =========================================
  // FORM STATES
  // =========================================

  readonly isSubmitting = signal(false);

  readonly errorMessage = signal('');

  readonly successMessage = signal('');

  readonly submittedReferenceId = signal('');

  // =========================================
  // VALIDATION REQUIREMENTS
  // =========================================

  readonly minimumSubjectLength = 5;

  readonly maximumSubjectLength = 100;

  readonly minimumMessageLength = 10;

  readonly maximumMessageLength = 2000;

  // =========================================
  // STEP 103.7 - SUPPORT REQUEST TRACKING
  // =========================================

  readonly supportRequests =
    signal<ResidentSupportRequest[]>([]);

  readonly isLoadingRequests = signal(true);

  readonly requestsError = signal('');

  readonly totalSupportRequests = computed(
    () => this.supportRequests().length
  );

  readonly openSupportRequests = computed(
    () => this.supportRequests().filter(
      request => request.status === 'open'
    ).length
  );

  readonly inProgressSupportRequests = computed(
    () => this.supportRequests().filter(
      request => request.status === 'in_progress'
    ).length
  );

  readonly resolvedSupportRequests = computed(
    () => this.supportRequests().filter(
      request => request.status === 'resolved'
    ).length
  );

  // =========================================
  // FIRESTORE LISTENER
  // =========================================

  private unsubscribeSupportRequests:
    Unsubscribe | null = null;

  private destroyed = false;

  // =========================================
  // COMPONENT INITIALIZATION
  // =========================================

  ngOnInit(): void {

    void this.initializeSupportRequests();

  }

  // =========================================
  // COMPONENT CLEANUP
  // =========================================

  ngOnDestroy(): void {

    this.destroyed = true;

    this.unsubscribeSupportRequests?.();

    this.unsubscribeSupportRequests = null;

  }

  // =========================================
  // INITIALIZE RESIDENT REQUEST HISTORY
  // =========================================

  private async initializeSupportRequests():
    Promise<void> {

    this.isLoadingRequests.set(true);
    this.requestsError.set('');

    try {

      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.requestsError.set(
          'Please sign in to view your support requests.'
        );

        this.isLoadingRequests.set(false);

        return;

      }

      this.subscribeToResidentRequests(
        currentUser.uid
      );

    } catch (error) {

      console.error(
        'Unable to initialize support request history:',
        error
      );

      if (!this.destroyed) {

        this.requestsError.set(
          'Unable to load your support request history.'
        );

        this.isLoadingRequests.set(false);

      }

    }

  }

  // =========================================
  // REAL-TIME RESIDENT SUPPORT REQUESTS
  // =========================================

  private subscribeToResidentRequests(
    residentId: string
  ): void {

    this.unsubscribeSupportRequests?.();

    this.isLoadingRequests.set(true);
    this.requestsError.set('');

    // Only request documents owned by this resident.
    // Firestore Security Rules enforce ownership.

    const residentRequestsQuery = query(

      collection(db, 'supportRequests'),

      where('residentId', '==', residentId)

    );

    this.unsubscribeSupportRequests = onSnapshot(

      residentRequestsQuery,

      (snapshot) => {

        if (this.destroyed) {
          return;
        }

        const requests: ResidentSupportRequest[] =
          snapshot.docs.map(requestDoc => {

            const data = requestDoc.data();

            const statusValue = data['status'];

            let status: SupportStatus = 'unknown';

            if (
              statusValue === 'open' ||
              statusValue === 'in_progress' ||
              statusValue === 'resolved'
            ) {
              status = statusValue;
            }

            const createdAt = data['createdAt'];
            const updatedAt = data['updatedAt'];

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
                createdAt instanceof Timestamp
                  ? createdAt.toDate()
                  : null,

              updatedAt:
                updatedAt instanceof Timestamp
                  ? updatedAt.toDate()
                  : null

            };

          });

        // =====================================
        // SORT NEWEST REQUESTS FIRST
        // =====================================

        requests.sort((a, b) => {

          const dateA =
            a.createdAt?.getTime() ?? 0;

          const dateB =
            b.createdAt?.getTime() ?? 0;

          return dateB - dateA;

        });

        this.supportRequests.set(requests);

        this.requestsError.set('');

        this.isLoadingRequests.set(false);

      },

      (error) => {

        if (this.destroyed) {
          return;
        }

        console.error(
          'Unable to retrieve resident support requests:',
          error
        );

        this.supportRequests.set([]);

        if (error.code === 'permission-denied') {

          this.requestsError.set(
            'Permission denied. Your account must be ' +
            'approved to view support requests.'
          );

        } else {

          this.requestsError.set(
            'Unable to retrieve your support requests. ' +
            'Please check your connection.'
          );

        }

        this.isLoadingRequests.set(false);

      }

    );

  }

  // =========================================
  // SUPPORT TOPIC DISPLAY
  // =========================================

  getTopicLabel(topicValue: string): string {

    const matchingTopic = this.topics.find(
      item => item.value === topicValue
    );

    return matchingTopic?.label ?? 'Other Concern';

  }

  // =========================================
  // SUPPORT STATUS DISPLAY
  // =========================================

  getStatusLabel(status: SupportStatus): string {

    switch (status) {

      case 'open':
        return 'Open';

      case 'in_progress':
        return 'In Progress';

      case 'resolved':
        return 'Resolved';

      default:
        return 'Unknown';

    }

  }

  // =========================================
  // SUBMIT CONTACT REQUEST
  // =========================================

  async submitContactRequest(
    form: NgForm
  ): Promise<void> {

    if (this.isSubmitting()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.submittedReferenceId.set('');

    // =====================================
    // NORMALIZE INPUT VALUES
    // =====================================

    const selectedTopic = this.topic.trim();

    const subject = this.subject.trim();

    const message = this.message.trim();

    // =====================================
    // VALIDATE SUPPORT TOPIC
    // =====================================

    const isValidTopic = this.topics.some(
      item => item.value === selectedTopic
    );

    if (!isValidTopic) {

      this.errorMessage.set(
        'Please select a valid support topic.'
      );

      return;

    }

    // =====================================
    // VALIDATE SUBJECT
    // =====================================

    if (
      subject.length < this.minimumSubjectLength ||
      subject.length > this.maximumSubjectLength
    ) {

      form.form.markAllAsTouched();

      this.errorMessage.set(
        'The subject must contain between 5 and 100 characters.'
      );

      return;

    }

    // =====================================
    // VALIDATE MESSAGE
    // =====================================

    if (
      message.length < this.minimumMessageLength ||
      message.length > this.maximumMessageLength
    ) {

      form.form.markAllAsTouched();

      this.errorMessage.set(
        'The message must contain between 10 and 2000 characters.'
      );

      return;

    }

    if (form.invalid) {

      form.form.markAllAsTouched();

      this.errorMessage.set(
        'Please complete all required fields.'
      );

      return;

    }

    // =====================================
    // PREVENT DUPLICATE SUBMISSIONS
    // =====================================

    this.isSubmitting.set(true);

    try {

      // ===================================
      // REQUIRE AUTHENTICATED RESIDENT
      // ===================================

      await auth.authStateReady();

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.errorMessage.set(
          'You must sign in before sending a support request.'
        );

        return;

      }

      // ===================================
      // CREATE SUPPORT REQUEST
      // ===================================

      const supportRequestsCollection = collection(
        db,
        'supportRequests'
      );

      const newRequest = await addDoc(
        supportRequestsCollection,
        {

          residentId: currentUser.uid,

          topic: selectedTopic,

          subject: subject,

          message: message,

          status: 'open',

          createdAt: serverTimestamp()

        }
      );

      if (this.destroyed) {
        return;
      }

      // ===================================
      // SUCCESSFUL FIRESTORE WRITE
      // ===================================

      this.submittedReferenceId.set(
        newRequest.id
      );

      this.successMessage.set(
        'Your support request was submitted successfully.'
      );

      // ===================================
      // RESET FORM
      // ===================================

      this.topic = 'general';
      this.subject = '';
      this.message = '';

      form.resetForm({
        topic: 'general',
        subject: '',
        message: ''
      });

      // The real-time Firestore listener will
      // automatically display the new request.

    } catch (error) {

      console.error(
        'Unable to submit contact request:',
        error
      );

      if (!this.destroyed) {

        this.errorMessage.set(
          'Unable to submit your request. ' +
          'Please check your connection and try again.'
        );

      }

    } finally {

      if (!this.destroyed) {
        this.isSubmitting.set(false);
      }

    }

  }

  // =========================================
  // CLEAR SUBMISSION FEEDBACK
  // =========================================

  clearFeedback(): void {

    this.errorMessage.set('');
    this.successMessage.set('');
    this.submittedReferenceId.set('');

  }

}
