/**
 * Auth mocking helpers for API route tests.
 *
 * Provides presets that mock `getServerSession` (from next-auth)
 * and the `sql` tagged-template query (from @vercel/postgres) so that
 * `requireAuth`, `requireAuthWithProfile`, and `requireAppAccess`
 * behave predictably without a real database or Azure AD session.
 */

// Re-usable mock references — set by the presets below
let _mockSession = null;
let _mockSqlResults = {};

/**
 * Mock `getServerSession` to return whatever _mockSession holds.
 */
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(() => Promise.resolve(_mockSession)),
}));

/**
 * Mock `@vercel/postgres` so `sql` returns preset rows.
 *
 * Keys in _mockSqlResults are matched against the first raw-string
 * fragment of the tagged template (e.g. a query containing "user_app_access"
 * will match the 'user_app_access' key).
 */
jest.mock('@vercel/postgres', () => ({
  sql: jest.fn((...args) => {
    // Tagged template: args[0] is the array of string fragments
    const queryText = Array.isArray(args[0]) ? args[0].join(' ') : '';

    // Match against known table names
    for (const [key, result] of Object.entries(_mockSqlResults)) {
      if (queryText.toLowerCase().includes(key.toLowerCase())) {
        return Promise.resolve(result);
      }
    }
    // Default: empty result set
    return Promise.resolve({ rows: [], rowCount: 0 });
  }),
}));

/**
 * Mock the NextAuth options import (auth.js imports from pages/api/auth/[...nextauth]).
 */
jest.mock('../../pages/api/auth/[...nextauth]', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Simulate an unauthenticated request (no session cookie).
 * All auth functions will fail with 401.
 */
export function mockUnauthenticated() {
  _mockSession = null;
  _mockSqlResults = {};
  // Ensure auth is required
  process.env.AUTH_REQUIRED = 'true';
  process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
  process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
  process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';
}

/**
 * Simulate an authenticated user with a linked profile and specific app grants.
 *
 * @param {number} profileId - The user's profile ID
 * @param {string[]} appKeys - App keys the user has been granted
 * @param {{ isSuperuser?: boolean }} [opts]
 */
export function mockAuthenticatedUser(profileId, appKeys = [], opts = {}) {
  _mockSession = {
    user: {
      profileId,
      email: `user${profileId}@wmkeck.org`,
      name: `Test User ${profileId}`,
    },
  };

  const roles = opts.isSuperuser ? [{ role: 'superuser' }] : [];

  _mockSqlResults = {
    user_app_access: { rows: appKeys.map(k => ({ app_key: k })), rowCount: appKeys.length },
    dynamics_user_roles: { rows: roles, rowCount: roles.length },
    is_active: { rows: [{ is_active: true }], rowCount: 1 },
  };

  process.env.AUTH_REQUIRED = 'true';
  process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
  process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
  process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';
}

/**
 * Simulate a disabled (soft-deleted) user.
 *
 * @param {number} profileId
 */
export function mockDisabledUser(profileId) {
  _mockSession = {
    user: {
      profileId,
      email: `disabled${profileId}@wmkeck.org`,
      name: `Disabled User ${profileId}`,
    },
  };

  _mockSqlResults = {
    user_app_access: { rows: [{ app_key: 'dynamics-explorer' }], rowCount: 1 },
    dynamics_user_roles: { rows: [], rowCount: 0 },
    is_active: { rows: [{ is_active: false }], rowCount: 1 },
  };

  process.env.AUTH_REQUIRED = 'true';
  process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
  process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
  process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';
}

/**
 * Simulate a user who is authenticated via Azure AD but has no linked profile.
 */
export function mockNoProfile() {
  _mockSession = {
    user: {
      email: 'noprofile@wmkeck.org',
      name: 'No Profile User',
      // no profileId
    },
  };

  _mockSqlResults = {};

  process.env.AUTH_REQUIRED = 'true';
  process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
  process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
  process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';
}

// ---------------------------------------------------------------------------
// Request / Response helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock request object.
 */
export function createMockReq({ method = 'GET', headers = {}, body = {}, query = {} } = {}) {
  return { method, headers, body, query };
}

/**
 * Create a minimal mock response object with jest.fn() spies.
 * Supports chained calls: res.status(401).json({...})
 */
export function createMockRes() {
  const res = {
    statusCode: 200,
    _headers: {},
    _data: null,
    _ended: false,
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (data) {
      this._data = data;
      return this;
    }),
    end: jest.fn(function () {
      this._ended = true;
      return this;
    }),
    setHeader: jest.fn(function (key, value) {
      this._headers[key] = value;
      return this;
    }),
    write: jest.fn(),
  };
  return res;
}

/**
 * Reset the app-access cache between tests.
 * Import clearAppAccessCache directly from auth.js.
 */
export { clearAppAccessCache } from '../../lib/utils/auth';
