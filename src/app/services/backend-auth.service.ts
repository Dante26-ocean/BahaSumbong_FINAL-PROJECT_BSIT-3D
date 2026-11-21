
import { Injectable } from '@angular/core';
import type { User } from 'firebase/auth';

// =========================================
// CENTRALIZED BACKEND API CONFIGURATION
// =========================================

import {
  buildBackendApiUrl
} from '../config/backend-api.config';

export interface BackendAuthResponse {
  status: 'success';
  message: string;
  uid: string;
  role: 'resident' | 'admin';
}

@Injectable({
  providedIn: 'root'
})
export class BackendAuthService {

  // Use the centralized backend API URL
  private readonly apiUrl =
    buildBackendApiUrl('/api');

  async verifyUser(user: User): Promise<BackendAuthResponse> {

    // Get the signed-in user's Firebase ID token
    const idToken = await user.getIdToken();

    // Send the token to our Node.js backend
    const response = await fetch(
      `${this.apiUrl}/auth/check`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`
        },
        cache: 'no-store'
      }
    );

    const result = await response.json();

    // Handle unsuccessful verification
    if (!response.ok || result.status !== 'success') {
      throw new Error(
        result.message || 'Backend authentication failed.'
      );
    }

    return result as BackendAuthResponse;
  }
}
