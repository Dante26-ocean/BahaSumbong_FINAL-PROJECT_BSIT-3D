
import { Component } from '@angular/core';

import { RouterLink } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';

// =========================================
// ABOUT US FEATURE STRUCTURE
// =========================================

interface SystemFeature {
  title: string;
  description: string;
  icon: string;
  route: string;
  routeLabel: string;
}

// =========================================
// USER ROLE STRUCTURE
// =========================================

interface SystemRole {
  title: string;
  description: string;
  icon: string;
}

// =========================================
// ABOUT US COMPONENT
// =========================================

@Component({
  selector: 'app-about-us',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule
  ],
  templateUrl: './about-us.html',
  styleUrl: './about-us.css',
})
export class AboutUs {

  // =========================================
  // SYSTEM INFORMATION
  // =========================================

  readonly systemName = 'BahaSumbong';

  readonly systemFullName =
    'BahaSumbong: A Flood-Prone Area & Drainage Mapping System';

  readonly systemDescription =
    'BahaSumbong is an academic demonstration web application ' +
    'designed to help community residents report flooding and ' +
    'drainage-related problems. It allows authorized administrators ' +
    'to review reports, monitor mapped locations, and update ' +
    'the status of submitted reports.';

  // =========================================
  // SYSTEM OBJECTIVE
  // =========================================

  readonly systemObjective =
    'The main objective of BahaSumbong is to provide a ' +
    'centralized platform for community reporting and mapping ' +
    'of flood-prone locations and drainage concerns. ' +
    'The system helps organize submitted information so ' +
    'authorized personnel can identify reported areas ' +
    'that may require attention.';

  // =========================================
  // SYSTEM FEATURES
  // =========================================

  readonly features: SystemFeature[] = [

    {
      title: 'Community Reporting',
      description:
        'Approved residents can submit reports about ' +
        'flooding, blocked drainage, and damaged drainage ' +
        'structures. Reports include descriptions, ' +
        'locations, and supporting photos.',
      icon: 'description',
      route: '/community/create-report',
      routeLabel: 'Create Report'
    },

    {
      title: 'Interactive Community Map',
      description:
        'Residents can select locations on an interactive ' +
        'map and view their submitted reports with ' +
        'available geographic coordinates.',
      icon: 'map',
      route: '/community/map',
      routeLabel: 'Open Community Map'
    },

    {
      title: 'Report Status Tracking',
      description:
        'Residents can review their submitted reports ' +
        'and check whether the administrator has marked ' +
        'them as Pending, In Progress, Resolved, or Rejected.',
      icon: 'assignment',
      route: '/community/my-reports',
      routeLabel: 'View My Reports'
    },

    {
      title: 'Report Notifications',
      description:
        'Residents can view report status updates ' +
        'through the Notifications page.',
      icon: 'notifications',
      route: '/community/notifications',
      routeLabel: 'View Notifications'
    },

    {
      title: 'Help and Support',
      description:
        'Residents can find answers to common questions ' +
        'and submit support requests concerning ' +
        'their accounts or the BahaSumbong system.',
      icon: 'help_outline',
      route: '/community/help-center',
      routeLabel: 'Open Help Center'
    }

  ];

  // =========================================
  // SYSTEM USER ROLES
  // =========================================

  readonly userRoles: SystemRole[] = [

    {
      title: 'Community Residents',
      description:
        'Residents sign in using Google, complete account ' +
        'verification, submit reports, select problem ' +
        'locations, and monitor their submitted reports.',
      icon: 'people'
    },

    {
      title: 'Community Administrators',
      description:
        'Authorized administrators review resident ' +
        'verification requests, examine community reports, ' +
        'monitor mapped report locations, update report ' +
        'statuses, and manage submitted support requests.',
      icon: 'admin_panel_settings'
    }

  ];

  // =========================================
  // SYSTEM LIMITATIONS
  // =========================================

  readonly limitations: string[] = [

    'BahaSumbong does not predict future floods or typhoons.',

    'The system does not provide automatic flood warnings or emergency alerts.',

    'Submitted reports depend on information provided by residents and may require independent verification.',

    'The map displays submitted report locations and does not automatically determine whether an area is safe or dangerous.',

    'BahaSumbong is an academic demonstration system and is not an official disaster monitoring or emergency response service.',

    'The system does not replace professional inspections, local government assessments, or emergency response procedures.'

  ];

}
