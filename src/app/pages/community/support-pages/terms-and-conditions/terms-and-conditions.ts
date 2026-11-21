
import {
  Component,
  signal
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';

// =========================================
// TERMS AND CONDITIONS STRUCTURE
// =========================================

interface TermsSection {
  id: string;
  title: string;
  icon: string;
  paragraphs: string[];
  points: string[];
}

// =========================================
// TERMS AND CONDITIONS COMPONENT
// =========================================

@Component({
  selector: 'app-terms-and-conditions',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule
  ],
  templateUrl: './terms-and-conditions.html',
  styleUrl: './terms-and-conditions.css',
})
export class TermsAndConditions {

  // =========================================
  // SYSTEM INFORMATION
  // =========================================

  readonly systemName = 'BahaSumbong';

  readonly systemFullName =
    'BahaSumbong: A Flood-Prone Area & Drainage Mapping System';

  readonly projectNotice =
    'BahaSumbong is an academic demonstration ' +
    'web application. These guidelines explain ' +
    'the intended use of the prototype and are ' +
    'not a substitute for a legally reviewed ' +
    'privacy policy or public-service agreement.';

  // =========================================
  // TERMS AND CONDITIONS SECTIONS
  // =========================================

  readonly sections: TermsSection[] = [

    // =====================================
    // 1. ACCEPTABLE USE
    // =====================================

    {
      id: 'acceptable-use',
      title: '1. Acceptable Use',
      icon: 'assignment_turned_in',

      paragraphs: [
        'BahaSumbong is designed for reporting ' +
        'flooding and drainage-related concerns ' +
        'within the scope of an academic demonstration.',

        'Residents should use the system responsibly ' +
        'and provide information that is relevant ' +
        'to its reporting and mapping features.'
      ],

      points: [
        'Use the application for its intended reporting and support purposes.',

        'Submit accurate and relevant information.',

        'Do not submit intentionally false, misleading, or duplicate reports.',

        'Do not use the system to harass, impersonate, or threaten other people.',

        'Do not attempt to bypass authentication or access another user’s information.'
      ]
    },

    // =====================================
    // 2. ACCOUNT REGISTRATION
    // =====================================

    {
      id: 'account-registration',
      title: '2. Account Registration and Verification',
      icon: 'verified_user',

      paragraphs: [
        'Community residents sign in using their ' +
        'Google accounts. Access to protected ' +
        'community features requires administrator approval.',

        'Administrator accounts are created ' +
        'separately and are not available ' +
        'through public registration.'
      ],

      points: [
        'Use a Google account that belongs to you.',

        'Complete the required demonstration verification process.',

        'Do not submit another person’s identity or account information.',

        'Keep your Google account credentials private.',

        'Contact the administrator if your verification request is rejected or you experience an account problem.'
      ]
    },

    // =====================================
    // 3. COMMUNITY REPORTING
    // =====================================

    {
      id: 'community-reporting',
      title: '3. Community Reporting Guidelines',
      icon: 'description',

      paragraphs: [
        'Approved residents can submit reports ' +
        'about flooding, blocked drainage, and ' +
        'damaged drainage structures.',

        'Submitted reports may be reviewed by ' +
        'authorized administrators, who can ' +
        'update their statuses.'
      ],

      points: [
        'Choose the appropriate type of flooding or drainage problem.',

        'Provide a clear and accurate description of the concern.',

        'Select the correct location on the interactive map.',

        'Attach 1 to 3 relevant supporting JPG or PNG photos, each no larger than 3 MB.',

        'Avoid including unnecessary personal or sensitive information.',

        'Understand that a submitted report is not automatically confirmed as accurate.'
      ]
    },

    // =====================================
    // 4. REPORT REVIEW
    // =====================================

    {
      id: 'report-review',
      title: '4. Administrator Review and Report Status',
      icon: 'fact_check',

      paragraphs: [
        'Authorized administrators can examine ' +
        'submitted community reports and update ' +
        'their statuses through the system.',

        'A report status represents an action ' +
        'recorded in BahaSumbong. It does not ' +
        'guarantee that a physical inspection ' +
        'or repair has occurred.'
      ],

      points: [
        'Pending means the report is awaiting an administrator decision.',

        'In Progress means the administrator has marked the report for attention.',

        'Resolved means the administrator has marked the report as resolved.',

        'Rejected means the administrator has not accepted the report.',

        'Residents can monitor current report statuses using My Reports and Notifications.'
      ]
    },

    // =====================================
    // 5. MAP INFORMATION
    // =====================================

    {
      id: 'map-information',
      title: '5. Map and Location Information',
      icon: 'map',

      paragraphs: [
        'BahaSumbong uses an interactive map ' +
        'to identify the geographic locations ' +
        'associated with community reports.',

        'Map markers display submitted report ' +
        'locations. They are not official ' +
        'flood-risk classifications.'
      ],

      points: [
        'Select report locations as accurately as possible.',

        'Do not intentionally place misleading map markers.',

        'Understand that reported map locations may contain errors.',

        'Do not interpret a map marker as proof that an area is safe or dangerous.',

        'Follow official local authorities for verified disaster information.'
      ]
    },

    // =====================================
    // 6. INFORMATION AND PRIVACY
    // =====================================

    {
      id: 'privacy-information',
      title: '6. Information and Privacy',
      icon: 'security',

      paragraphs: [
        'BahaSumbong uses Firebase Authentication ' +
        'for account sign-in and Cloud Firestore ' +
        'for application records.',

        'Supporting report photos are handled ' +
        'through the application backend ' +
        'and Cloudinary with protected access.',

        'Firestore security rules are designed ' +
        'to restrict residents to their own ' +
        'reports and support requests, while ' +
        'authorized administrators can review ' +
        'information needed for system management.',

        'Because this is an academic prototype, ' +
        'users should avoid submitting actual ' +
        'identity documents or unnecessary ' +
        'sensitive personal information. A formal ' +
        'data retention or deletion policy has ' +
        'not been established for public use.'
      ],

      points: [
        'Use demonstration information where appropriate.',

        'Never include passwords in community reports or support messages.',

        'Avoid uploading documents containing unnecessary personal information.',

        'Use your own account when accessing the application.',

        'Sign out after using BahaSumbong on a shared device.'
      ]
    },

    // =====================================
    // 7. HELP AND SUPPORT
    // =====================================

    {
      id: 'help-and-support',
      title: '7. Help and Support Requests',
      icon: 'contact_support',

      paragraphs: [
        'BahaSumbong provides Help Center ' +
        'and Contact Us features for questions ' +
        'and concerns related to using the system.',

        'Residents can submit support requests ' +
        'and monitor their current statuses. ' +
        'Administrators can review and update ' +
        'those statuses.',

        'Submitting a request does not guarantee ' +
        'an immediate response or send an email ' +
        'to the resident.'
      ],

      points: [
        'Use Contact Us for application-related concerns.',

        'Provide a clear subject and description of the issue.',

        'Do not include passwords or confidential credentials.',

        'Use official emergency contacts for urgent safety concerns.'
      ]
    },

    // =====================================
    // 8. SYSTEM LIMITATIONS
    // =====================================

    {
      id: 'system-limitations',
      title: '8. System Limitations and Disclaimer',
      icon: 'warning_amber',

      paragraphs: [
        'BahaSumbong is an academic demonstration ' +
        'system and is not an officially deployed ' +
        'government or emergency response platform.',

        'The application depends on submitted ' +
        'community information and does not ' +
        'independently verify every reported location.',

        'The application may be changed during ' +
        'development and does not promise ' +
        'continuous public availability.'
      ],

      points: [
        'The system does not predict incoming floods or typhoons.',

        'The system does not provide automatic flood warnings.',

        'The system is not a substitute for official risk assessments.',

        'The system does not dispatch emergency responders.',

        'Users should follow instructions from appropriate local authorities during actual emergencies.'
      ]
    }

  ];

  // =========================================
  // EXPANDABLE SECTIONS
  // =========================================

  readonly expandedSectionIds =
    signal<ReadonlySet<string>>(
      new Set<string>([
        'acceptable-use',
        'system-limitations'
      ])
    );

  // =========================================
  // TOGGLE A SECTION
  // =========================================

  toggleSection(sectionId: string): void {

    const sectionExists = this.sections.some(
      section => section.id === sectionId
    );

    if (!sectionExists) {
      return;
    }

    this.expandedSectionIds.update(current => {

      const updated = new Set(current);

      if (updated.has(sectionId)) {
        updated.delete(sectionId);
      } else {
        updated.add(sectionId);
      }

      return updated;

    });

  }

  // =========================================
  // CHECK SECTION EXPANSION
  // =========================================

  isSectionExpanded(sectionId: string): boolean {

    return this.expandedSectionIds().has(sectionId);

  }

  // =========================================
  // EXPAND ALL SECTIONS
  // =========================================

  expandAll(): void {

    this.expandedSectionIds.set(
      new Set(
        this.sections.map(section => section.id)
      )
    );

  }

  // =========================================
  // COLLAPSE ALL SECTIONS
  // =========================================

  collapseAll(): void {

    this.expandedSectionIds.set(
      new Set<string>()
    );

  }

}
