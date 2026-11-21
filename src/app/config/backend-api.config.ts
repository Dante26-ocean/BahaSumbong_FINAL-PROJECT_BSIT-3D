
/**
 * BahaSumbong Backend API Configuration
 *
 * Local development backend:
 * http://127.0.0.1:3000
 *
 * The URL will be updated when the backend
 * is deployed to an HTTPS hosting service.
 */

export const BACKEND_API_BASE_URL =
  'http://127.0.0.1:3000';

export function buildBackendApiUrl(
  endpoint: string
): string {

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  return `${BACKEND_API_BASE_URL}${normalizedEndpoint}`;

}
