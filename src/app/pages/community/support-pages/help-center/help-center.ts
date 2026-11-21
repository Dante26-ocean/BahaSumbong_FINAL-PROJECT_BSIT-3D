
import {
  Component,
  computed,
  signal
} from '@angular/core';

import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

// =========================================
// HELP CENTER CATEGORIES
// =========================================

export type HelpCategory =
  | 'all'
  | 'account'
  | 'reports'
  | 'map'
  | 'updates'
  | 'privacy';

// =========================================
// HELP CENTER DATA STRUCTURE
// =========================================

export interface HelpArticle {
  id: string;
  category: Exclude<HelpCategory, 'all'>;
  question: string;
  answer: string;
  route?: string;
  routeLabel?: string;
}

export interface HelpCategoryOption {
  id: HelpCategory;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule
  ],
  templateUrl: './help-center.html',
  styleUrl: './help-center.css',
})
export class HelpCenter {

  // =========================================
  // HELP CENTER CATEGORIES
  // =========================================

  readonly categories: HelpCategoryOption[] = [
    {
      id: 'all',
      label: 'All Topics',
      icon: 'help_outline'
    },
    {
      id: 'account',
      label: 'Account and Login',
      icon: 'account_circle'
    },
    {
      id: 'reports',
      label: 'Community Reports',
      icon: 'description'
    },
    {
      id: 'map',
      label: 'Community Map',
      icon: 'map'
    },
    {
      id: 'updates',
      label: 'Report Updates',
      icon: 'notifications'
    },
    {
      id: 'privacy',
      label: 'Privacy and Safety',
      icon: 'security'
    }
  ];

  // =========================================
  // FREQUENTLY ASKED QUESTIONS
  // =========================================

  readonly articles: HelpArticle[] = [

    // =====================================
    // ACCOUNT AND LOGIN
    // =====================================

    {
      id: 'resident-login',
      category: 'account',
      question: 'How do I sign in to BahaSumbong?',
      answer:
        'Community residents sign in using their Google account. ' +
        'Administrator accounts use a separate email and password login. ' +
        'Residents must complete account verification before accessing community features.',
      route: '/login',
      routeLabel: 'Go to Login'
    },

    {
      id: 'account-verification',
      category: 'account',
      question: 'Why does my account need verification?',
      answer:
        'BahaSumbong requires residents to complete account verification. ' +
        'An authorized administrator reviews the submitted request before ' +
        'the resident can access protected community features.'
    },

    {
      id: 'pending-verification',
      category: 'account',
      question: 'Why is my account still pending?',
      answer:
        'Your verification request is awaiting administrator review. ' +
        'You can access the community features after your account has been approved.'
    },

    {
      id: 'edit-profile',
      category: 'account',
      question: 'How can I update my profile?',
      answer:
        'Open My Profile and select Edit Profile. ' +
        'The current system allows approved residents to update their display name.',
      route: '/community/profile',
      routeLabel: 'Open My Profile'
    },

    // =====================================
    // COMMUNITY REPORTS
    // =====================================

    {
      id: 'submit-report',
      category: 'reports',
      question: 'How do I submit a community report?',
      answer:
        'Open the Community Map and select the location of the problem. ' +
        'Choose the problem type, enter a description, attach supporting photos, ' +
        'and submit your report.',
      route: '/community/map',
      routeLabel: 'Open Community Map'
    },

    {
      id: 'report-types',
      category: 'reports',
      question: 'What problems can I report?',
      answer:
        'You can submit reports about flooding, blocked drainage, ' +
        'and damaged drainage structures.'
    },

    {
      id: 'report-photos',
      category: 'reports',
      question: 'Are supporting photos required?',
      answer:
        'Yes. Each new report requires 1 to 3 supporting photos. ' +
        'Accepted formats are JPG and PNG, with a maximum size of 3 MB per photo.'
    },

    {
      id: 'failed-report',
      category: 'reports',
      question: 'What happens if my report upload is interrupted?',
      answer:
        'The system can remember an unfinished report within the browser session. ' +
        'If photo uploading fails, you may need to select your photos again ' +
        'and retry using the same report ID. The backend must be running ' +
        'for protected photo uploads to complete.'
    },

    {
      id: 'my-reports',
      category: 'reports',
      question: 'Where can I find my submitted reports?',
      answer:
        'Open My Reports to view your submitted community reports. ' +
        'Select a report to see its details, current status, and supporting photos.',
      route: '/community/my-reports',
      routeLabel: 'View My Reports'
    },

    // =====================================
    // COMMUNITY MAP
    // =====================================

    {
      id: 'select-location',
      category: 'map',
      question: 'How do I select a report location?',
      answer:
        'Open the Community Map and click the location of the flooding ' +
        'or drainage problem. A blue marker will appear. ' +
        'Confirm the location before continuing to the report form.',
      route: '/community/map',
      routeLabel: 'Open Community Map'
    },

    {
      id: 'map-markers',
      category: 'map',
      question: 'What do the map markers mean?',
      answer:
        'On the Community Map, the blue marker shows a newly selected ' +
        'report location. Orange markers represent your previously ' +
        'submitted reports with valid map coordinates.'
    },

    // =====================================
    // REPORT STATUS AND UPDATES
    // =====================================

    {
      id: 'report-status',
      category: 'updates',
      question: 'What do the different report statuses mean?',
      answer:
        'Pending means the report has not received an administrator decision. ' +
        'In Progress means an administrator has marked it for attention. ' +
        'Resolved means the administrator has marked it as resolved. ' +
        'Rejected means the administrator did not accept the report.'
    },

    {
      id: 'report-notifications',
      category: 'updates',
      question: 'How do I receive report status updates?',
      answer:
        'Open My Notifications to see the current status updates ' +
        'for your submitted reports. This feature displays current ' +
        'report information and does not send push notifications.',
      route: '/community/notifications',
      routeLabel: 'View My Notifications'
    },

    // =====================================
    // PRIVACY AND SAFETY
    // =====================================

    {
      id: 'photo-privacy',
      category: 'privacy',
      question: 'Who can view my report photos?',
      answer:
        'Report photos are stored through the protected backend. ' +
        'Access is restricted to authorized administrators and ' +
        'approved residents viewing their own reports.'
    },

    {
      id: 'flood-prediction',
      category: 'privacy',
      question: 'Does BahaSumbong predict floods?',
      answer:
        'No. BahaSumbong is a flood-prone area and drainage mapping ' +
        'system for community reporting. It does not predict floods, ' +
        'issue official emergency warnings, or replace professional ' +
        'disaster monitoring and response services.'
    }

  ];

  // =========================================
  // SEARCH AND FILTER STATES
  // =========================================

  readonly searchText = signal('');

  readonly selectedCategory =
    signal<HelpCategory>('all');

  readonly expandedArticleIds =
    signal<ReadonlySet<string>>(new Set<string>());

  // =========================================
  // FILTERED HELP ARTICLES
  // =========================================

  readonly filteredArticles = computed(() => {

    const search = this.searchText()
      .trim()
      .toLowerCase();

    const category = this.selectedCategory();

    return this.articles.filter(article => {

      const matchesCategory =
        category === 'all' ||
        article.category === category;

      const searchableContent = [
        article.question,
        article.answer
      ].join(' ').toLowerCase();

      const matchesSearch =
        search === '' ||
        searchableContent.includes(search);

      return matchesCategory && matchesSearch;

    });

  });

  // =========================================
  // ARTICLE COUNTS
  // =========================================

  readonly totalArticles = this.articles.length;

  readonly visibleArticleCount = computed(
    () => this.filteredArticles().length
  );

  // =========================================
  // UPDATE SEARCH
  // =========================================

  updateSearch(value: string): void {

    this.searchText.set(value);

  }

  // =========================================
  // SELECT HELP CATEGORY
  // =========================================

  selectCategory(category: HelpCategory): void {

    const validCategory = this.categories.some(
      item => item.id === category
    );

    if (!validCategory) {
      return;
    }

    this.selectedCategory.set(category);

  }

  // =========================================
  // EXPAND OR COLLAPSE AN ARTICLE
  // =========================================

  toggleArticle(articleId: string): void {

    const articleExists = this.articles.some(
      item => item.id === articleId
    );

    if (!articleExists) {
      return;
    }

    this.expandedArticleIds.update(current => {

      const updated = new Set(current);

      if (updated.has(articleId)) {

        updated.delete(articleId);

      } else {

        updated.add(articleId);

      }

      return updated;

    });

  }

  // =========================================
  // CHECK WHETHER AN ARTICLE IS EXPANDED
  // =========================================

  isArticleExpanded(articleId: string): boolean {

    return this.expandedArticleIds().has(articleId);

  }

  // =========================================
  // CLEAR SEARCH AND CATEGORY FILTER
  // =========================================

  clearFilters(): void {

    this.searchText.set('');

    this.selectedCategory.set('all');

  }

}
