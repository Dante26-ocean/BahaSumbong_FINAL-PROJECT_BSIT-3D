
import { Routes } from '@angular/router';

// =========================================
// AUTHENTICATION COMPONENTS
// =========================================

import { Login } from './pages/auth/login/login';
import { Register } from './pages/auth/register/register';
import { AccountConfirmation } from './pages/auth/account-confirmation/account-confirmation';
import { IdentityVerification } from './pages/auth/identity-verification/identity-verification';
import { RegistrationSubmitted } from './pages/auth/registration-submitted/registration-submitted';

// =========================================
// COMMUNITY COMPONENTS
// =========================================

import { Dashboard as CommunityDashboard } from './pages/community/dashboard/dashboard';
import { CreateReport } from './pages/community/create-report/create-report';
import { MyReports } from './pages/community/my-reports/my-reports';
import { ReportDetails as CommunityReportDetails } from './pages/community/report-details/report-details';
import { Map as CommunityMap } from './pages/community/map/map';
import { Profile as CommunityProfile } from './pages/community/profile/profile';
import { EditProfile } from './pages/community/edit-profile/edit-profile';
import { Notifications as CommunityNotifications } from './pages/community/notifications/notifications';

// =========================================
// COMMUNITY SUPPORT COMPONENTS
// =========================================

import { HelpCenter } from './pages/community/support-pages/help-center/help-center';
import { AccountAndLogin } from './pages/community/support-pages/account-and-login/account-and-login';
import { ContactUs } from './pages/community/support-pages/contact-us/contact-us';
import { AboutUs } from './pages/community/support-pages/about-us/about-us';
import { TermsAndConditions } from './pages/community/support-pages/terms-and-conditions/terms-and-conditions';

// =========================================
// ADMINISTRATOR COMPONENTS
// =========================================

import { Dashboard as AdminDashboard } from './pages/admin/dashboard/dashboard';
import { Reports } from './pages/admin/reports/reports';
import { Map as AdminMap } from './pages/admin/map/map';
import { VerificationRequests } from './pages/admin/verification-requests/verification-requests';
import { UserDetails } from './pages/admin/user-details/user-details';
import { Notifications as AdminNotifications } from './pages/admin/notifications/notifications';
import { Profile as AdminProfile } from './pages/admin/profile/profile';
import { SupportRequests } from './pages/admin/support-requests/support-requests';

// =========================================
// ROUTE GUARDS
// =========================================

import { adminGuard } from './guards/admin.guard';
import { approvedResidentGuard } from './guards/approved-resident.guard';

// =========================================
// APPLICATION ROUTES
// =========================================

export const routes: Routes = [

  // =========================================
  // DEFAULT ROUTE
  // =========================================

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  // =========================================
  // AUTHENTICATION ROUTES
  // =========================================

  {
    path: 'login',
    component: Login,
    title: 'Login | BahaSumbong'
  },

  {
    path: 'register',
    component: Register,
    title: 'Register | BahaSumbong'
  },

  {
    path: 'account-confirmation',
    component: AccountConfirmation,
    title: 'Account Confirmation | BahaSumbong'
  },

  {
    path: 'identity-verification',
    component: IdentityVerification,
    title: 'Identity Verification | BahaSumbong'
  },

  {
    path: 'registration-submitted',
    component: RegistrationSubmitted,
    title: 'Registration Submitted | BahaSumbong'
  },

  // =========================================
  // COMMUNITY ROUTES
  // =========================================

  {
    path: 'community/dashboard',
    component: CommunityDashboard,
    canActivate: [approvedResidentGuard],
    title: 'Community Dashboard | BahaSumbong'
  },

  {
    path: 'community/create-report',
    component: CreateReport,
    canActivate: [approvedResidentGuard],
    title: 'Create Report | BahaSumbong'
  },

  {
    path: 'community/my-reports',
    component: MyReports,
    canActivate: [approvedResidentGuard],
    title: 'My Reports | BahaSumbong'
  },

  {
    path: 'community/report-details/:reportId',
    component: CommunityReportDetails,
    canActivate: [approvedResidentGuard],
    title: 'Report Details | BahaSumbong'
  },

  {
    path: 'community/map',
    component: CommunityMap,
    canActivate: [approvedResidentGuard],
    title: 'Community Map | BahaSumbong'
  },

  // =========================================
  // COMMUNITY PROFILE ROUTES
  // =========================================

  {
    path: 'community/profile',
    component: CommunityProfile,
    canActivate: [approvedResidentGuard],
    title: 'My Profile | BahaSumbong'
  },

  {
    path: 'community/edit-profile',
    component: EditProfile,
    canActivate: [approvedResidentGuard],
    title: 'Edit Profile | BahaSumbong'
  },

  // =========================================
  // COMMUNITY NOTIFICATIONS
  // =========================================

  {
    path: 'community/notifications',
    component: CommunityNotifications,
    canActivate: [approvedResidentGuard],
    title: 'My Notifications | BahaSumbong'
  },

  // =========================================
  // COMMUNITY SUPPORT ROUTES
  // =========================================

  {
    path: 'community/help-center',
    component: HelpCenter,
    canActivate: [approvedResidentGuard],
    title: 'Help Center | BahaSumbong'
  },

  {
    path: 'community/account-and-login',
    component: AccountAndLogin,
    canActivate: [approvedResidentGuard],
    title: 'Account and Login | BahaSumbong'
  },

  {
    path: 'community/contact-us',
    component: ContactUs,
    canActivate: [approvedResidentGuard],
    title: 'Contact Us | BahaSumbong'
  },

  {
    path: 'community/about-us',
    component: AboutUs,
    canActivate: [approvedResidentGuard],
    title: 'About Us | BahaSumbong'
  },

  // =========================================
  // STEP 105.2 - TERMS AND CONDITIONS
  // =========================================

  {
    path: 'community/terms-and-conditions',
    component: TermsAndConditions,
    canActivate: [approvedResidentGuard],
    title: 'Terms and Conditions | BahaSumbong'
  },

  // =========================================
  // ADMINISTRATOR ROUTES
  // =========================================

  {
    path: 'admin/dashboard',
    component: AdminDashboard,
    canActivate: [adminGuard],
    title: 'Admin Dashboard | BahaSumbong'
  },

  {
    path: 'admin/reports',
    component: Reports,
    canActivate: [adminGuard],
    title: 'Community Reports Management | BahaSumbong'
  },

  {
    path: 'admin/map',
    component: AdminMap,
    canActivate: [adminGuard],
    title: 'Administrator Map | BahaSumbong'
  },

  {
    path: 'admin/verification-requests',
    component: VerificationRequests,
    canActivate: [adminGuard],
    title: 'Verification Requests | BahaSumbong'
  },

  {
    path: 'admin/user-details/:uid',
    component: UserDetails,
    canActivate: [adminGuard],
    title: 'Resident Details | BahaSumbong'
  },

  {
    path: 'admin/notifications',
    component: AdminNotifications,
    canActivate: [adminGuard],
    title: 'Administrator Notifications | BahaSumbong'
  },

  {
    path: 'admin/profile',
    component: AdminProfile,
    canActivate: [adminGuard],
    title: 'Administrator Profile | BahaSumbong'
  },

  {
    path: 'admin/support-requests',
    component: SupportRequests,
    canActivate: [adminGuard],
    title: 'Support Requests | BahaSumbong'
  },

  // =========================================
  // UNKNOWN ROUTES
  // =========================================

  {
    path: '**',
    redirectTo: 'login'
  }

];
