/**
 * Unit tests for authentication utilities (lib/utils/auth.js).
 *
 * Covers:
 * - requireAuth: unauthenticated → 401, CSRF validation
 * - requireAuthWithProfile: no profile → 403, disabled → 403
 * - requireAppAccess: missing app → 403, superuser bypass, disabled → 403
 * - validateOrigin (tested via requireAuth/requireAppAccess CSRF path)
 */

import {
  mockUnauthenticated,
  mockAuthenticatedUser,
  mockDisabledUser,
  mockNoProfile,
  createMockReq,
  createMockRes,
  clearAppAccessCache,
} from '../../helpers/auth-mock';

import {
  requireAuth,
  requireAuthWithProfile,
  requireAppAccess,
} from '../../../lib/utils/auth';

// Clear the in-memory app-access cache between every test
beforeEach(() => {
  clearAppAccessCache();
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe('requireAuth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated();
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });

  it('returns session when authenticated', async () => {
    mockAuthenticatedUser(1, ['reviewer-finder']);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuth(req, res);

    expect(result).toBeTruthy();
    expect(result.user.profileId).toBe(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 on CSRF origin mismatch for POST', async () => {
    mockAuthenticatedUser(1, ['reviewer-finder']);
    process.env.NEXTAUTH_URL = 'https://our-app.vercel.app';

    const req = createMockReq({
      method: 'POST',
      headers: { origin: 'https://evil.com' },
    });
    const res = createMockRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows POST when origin matches NEXTAUTH_URL', async () => {
    mockAuthenticatedUser(1, []);
    process.env.NEXTAUTH_URL = 'https://our-app.vercel.app';

    const req = createMockReq({
      method: 'POST',
      headers: { origin: 'https://our-app.vercel.app' },
    });
    const res = createMockRes();

    const result = await requireAuth(req, res);

    expect(result).toBeTruthy();
  });

  it('allows POST with no Origin header (server-to-server / cron)', async () => {
    mockAuthenticatedUser(1, []);
    process.env.NEXTAUTH_URL = 'https://our-app.vercel.app';

    const req = createMockReq({ method: 'POST', headers: {} });
    const res = createMockRes();

    const result = await requireAuth(req, res);

    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// requireAuthWithProfile
// ---------------------------------------------------------------------------
describe('requireAuthWithProfile', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated();
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuthWithProfile(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when no profile is linked', async () => {
    mockNoProfile();
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuthWithProfile(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('profile') })
    );
  });

  it('returns 403 when user is disabled', async () => {
    mockDisabledUser(99);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuthWithProfile(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('disabled') })
    );
  });

  it('returns profileId for valid authenticated user', async () => {
    mockAuthenticatedUser(5, ['reviewer-finder']);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAuthWithProfile(req, res);

    expect(result).toBe(5);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireAppAccess
// ---------------------------------------------------------------------------
describe('requireAppAccess', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated();
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when no profile is linked', async () => {
    mockNoProfile();
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when user lacks the required app', async () => {
    mockAuthenticatedUser(1, ['dynamics-explorer']);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('access') })
    );
  });

  it('returns access object when user has the required app', async () => {
    mockAuthenticatedUser(3, ['reviewer-finder', 'dynamics-explorer']);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeTruthy();
    expect(result.profileId).toBe(3);
    expect(result.session.user.profileId).toBe(3);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows access when user has ANY of multiple app keys (OR logic)', async () => {
    mockAuthenticatedUser(1, ['review-manager']);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder', 'review-manager');

    expect(result).toBeTruthy();
    expect(result.profileId).toBe(1);
  });

  it('superuser bypasses all app checks', async () => {
    mockAuthenticatedUser(2, [], { isSuperuser: true });
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeTruthy();
    expect(result.profileId).toBe(2);
  });

  it('returns 403 for disabled user even with superuser role', async () => {
    mockDisabledUser(99);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'dynamics-explorer');

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('disabled') })
    );
  });

  it('returns 403 on CSRF origin mismatch for POST', async () => {
    mockAuthenticatedUser(1, ['reviewer-finder']);
    process.env.NEXTAUTH_URL = 'https://our-app.vercel.app';

    const req = createMockReq({
      method: 'POST',
      headers: { origin: 'https://evil.com' },
    });
    const res = createMockRes();

    const result = await requireAppAccess(req, res, 'reviewer-finder');

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
