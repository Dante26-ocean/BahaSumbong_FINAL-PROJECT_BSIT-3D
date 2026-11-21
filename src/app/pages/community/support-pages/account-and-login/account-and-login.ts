
import { Component, signal } from '@angular/core';

import { RouterLink } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';

// =========================================
// ACCOUNT SUPPORT QUESTION STRUCTURE
// =========================================

interface AccountHelpQuestion {
  id: string;
  question: string;
  answer: string;
  icon: string;
  route?: string;
  routeLabel?: string;
}

@Component({
  selector: 'app-account-and-login',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule
  ],
  templateUrl: './account-and-login.html',
  styleUrl: './account-and-login.css',
})
export class AccountAndLogin {

  // =========================================
  // ACCOUNT VERIFICATION STATUS GUIDANCE
  // =========================================

  readonly verificationStatuses = [
    {
      label: 'Not Submitted',
      icon: 'assignment_late',
      description:
        'You have not yet submitted an account verification request.'
    },
    {
      label: 'Pending',
      icon: 'hourglass_empty',
      description:
        'Your verification request is waiting for administrator review.'
    },
    {
      label: 'Approved',
      icon: 'verified_user',
      description:
        'Your account has been approved and can access protected community features.'
    },
    {
      label: 'Rejected',
      icon: 'cancel',
      description:
        'Your verification request was declined. Contact an administrator for assistance.'
    }
  ];

  // =========================================
  // ACCOUNT AND LOGIN FAQ
  // =========================================

  readonly questions: AccountHelpQuestion[] = [

    {
      id: 'google-login',
      question: 'How do I log in to BahaSumbong?',
      answer:
        'Community residents sign in using their Google account. ' +
        'Open the Login page and select the Google sign-in option. ' +
        'Administrator accounts use a separate email and password login.',
      icon: 'login'
    },

    {
      id: 'account-verification',
      question: 'Why do I need to verify my account?',
      answer:
        'BahaSumbong requires resident account verification ' +
        'before allowing access to community reporting features. ' +
        'An authorized administrator reviews verification requests ' +
        'before approving accounts.',
      icon: 'verified_user'
    },

    {
      id: 'verification-pending',
      question: 'What if my account verification is still pending?',
      answer:
        'Your request is awaiting administrator review. ' +
        'You cannot access protected community features ' +
        'until your account has been approved.',
      icon: 'hourglass_empty'
    },

    {
      id: 'verification-rejected',
      question: 'What happens if my verification is rejected?',
      answer:
        'If your verification request is rejected, ' +
        'your account will not receive access to the protected ' +
        'community features. Contact an administrator ' +
        'for assistance.',
      icon: 'cancel'
    },

    {
      id: 'login-problem',
      question: 'What should I do if I cannot sign in?',
      answer:
        'Make sure you have an internet connection ' +
        'and are using the correct Google account. ' +
        'If Google sign-in succeeds but community access ' +
        'is unavailable, check whether your account ' +
        'verification has been approved.',
      icon: 'error_outline'
    },

    {
      id: 'forgot-password',
      question: 'What if I forgot my password?',
      answer:
        'Residents sign in through Google, so BahaSumbong ' +
        'does not manage a separate resident password. ' +
        'Use Google account recovery if you cannot access ' +
        'your Google account.',
      icon: 'lock_reset'
    },

    {
      id: 'edit-profile',
      question: 'How do I update my account information?',
      answer:
        'Open My Profile and select Edit Profile. ' +
        'The current system allows approved residents ' +
        'to update their display name.',
      icon: 'manage_accounts',
      route: '/community/profile',
      routeLabel: 'Open My Profile'
    },

    {
      id: 'change-email',
      question: 'Can I change my email address?',
      answer:
        'Your resident account uses your Google account ' +
        'for authentication. The current BahaSumbong ' +
        'profile editor does not provide an email ' +
        'address change feature.',
      icon: 'alternate_email'
    },

    {
      id: 'sign-out',
      question: 'How do I sign out of my account?',
      answer:
        'Open the Community Dashboard and select Sign Out. ' +
        'The system will sign you out of your BahaSumbong ' +
        'session and return you to the Login page.',
      icon: 'logout',
      route: '/community/dashboard',
      routeLabel: 'Open Community Dashboard'
    },

    {
      id: 'account-security',
      question: 'How can I keep my account secure?',
      answer:
        'Keep your Google account credentials private, ' +
        'avoid sharing sensitive personal information ' +
        'in report descriptions, and sign out when ' +
        'using a shared device.',
      icon: 'security'
    }

  ];

  // =========================================
  // EXPANDABLE QUESTION STATE
  // =========================================

  readonly expandedQuestionId = signal<string | null>(
    null
  );

  // =========================================
  // TOGGLE QUESTION
  // =========================================

  toggleQuestion(questionId: string): void {

    const questionExists = this.questions.some(
      question => question.id === questionId
    );

    if (!questionExists) {
      return;
    }

    this.expandedQuestionId.update(currentId => {

      if (currentId === questionId) {
        return null;
      }

      return questionId;

    });

  }

  // =========================================
  // CHECK EXPANDED QUESTION
  // =========================================

  isQuestionExpanded(questionId: string): boolean {

    return this.expandedQuestionId() === questionId;

  }

}
