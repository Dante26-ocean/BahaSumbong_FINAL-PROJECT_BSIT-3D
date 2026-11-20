
import { Routes } from '@angular/router';

// =========================================
// AUTHENTICATION
// =========================================

import { Login } from './pages/auth/login/login';
import { Register } from './pages/auth/register/register';

import { AccountConfirmation } from './pages/auth/account-confirmation/account-confirmation';
import { IdentityVerification } from './pages/auth/identity-verification/identity-verification';
import { RegistrationSubmitted } from './pages/auth/registration-submitted/registration-submitted';

// =========================================
// COMMUNITY
// =========================================

import { Dashboard as CommunityDashboard } from './pages/community/dashboard/dashboard';
import { CreateReport } from './pages/community/create-report/create-report';
import { MyReports } from './pages/community/my-reports/my-reports';
import { ReportDetails as CommunityReportDetails } from './pages/community/report-details/report-details';
import { Map as CommunityMap } from './pages/community/map/map';

// =========================================
// ADMINISTRATOR
// =========================================

import { Dashboard as AdminDashboard } from './pages/admin/dashboard/dashboard';
import { Reports } from './pages/admin/reports/reports';
import { Map as AdminMap } from './pages/admin/map/map';

import { VerificationRequests } from './pages/admin/verification-requests/verification-requests';
import { UserDetails } from './pages/admin/user-details/user-details';

// =========================================
// ROUTE GUARDS
// =========================================

import { adminGuard } from './guards/admin.guard';
import { approvedResidentGuard } from './guards/approved-resident.guard';

// =========================================
// APPLICATION ROUTES
// =========================================

export const routes: Routes = [

  // DEFAULT ROUTE
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  // AUTHENTICATION
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

  // ACCOUNT VERIFICATION
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

  // NEW: ADMINISTRATOR MAP
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

  // =========================================
  // UNKNOWN ROUTES
  // =========================================

  {
    path: '**',
    redirectTo: 'login'
  }

];
