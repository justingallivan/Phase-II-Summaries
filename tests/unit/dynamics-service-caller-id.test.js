/**
 * MSCRMCallerID impersonation header — unit coverage for write helpers.
 *
 * Verifies that when `actingUserSystemId` is supplied, DynamicsService
 * write methods send the `MSCRMCallerID` header so Dataverse attributes
 * createdby/modifiedby/audit history to the acting staff member. When
 * the option is omitted (cron / unattended writes), the header is absent.
 */

import { DynamicsService } from '../../lib/services/dynamics-service.js';
import { withDynamicsContext } from '../../lib/services/dynamics-context.js';

const ACTING_GUID = '00000000-0000-0000-0000-000000000abc';

beforeAll(() => {
  process.env.DYNAMICS_URL = 'https://example.crm.dynamics.com';
  process.env.DYNAMICS_TENANT_ID = 't';
  process.env.DYNAMICS_CLIENT_ID = 'c';
  process.env.DYNAMICS_CLIENT_SECRET = 's';
});

beforeEach(() => {
  fetch.mockClear();
  DynamicsService.clearCaches();

  // Token endpoint always succeeds first
  fetch.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('login.microsoftonline.com')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }),
      });
    }
    // Default success for write paths
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });
});

function lastRequestHeaders() {
  const calls = fetch.mock.calls;
  // Skip the token call(s); return headers from the last non-token call.
  for (let i = calls.length - 1; i >= 0; i--) {
    const [url, init] = calls[i];
    if (!String(url).includes('login.microsoftonline.com')) {
      return init?.headers || {};
    }
  }
  return {};
}

describe('MSCRMCallerID impersonation header', () => {
  test('createRecord adds the header when actingUserSystemId is set', async () => {
    fetch.mockImplementationOnce((url) => {
      if (String(url).includes('login.microsoftonline.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 't', expires_in: 3600 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '1' }) }),
    );

    await DynamicsService.createRecord('wmkf_ai_runs', { foo: 'bar' }, { actingUserSystemId: ACTING_GUID });
    expect(lastRequestHeaders().MSCRMCallerID).toBe(ACTING_GUID);
  });

  test('createRecord omits the header when actingUserSystemId is null', async () => {
    await DynamicsService.createRecord('wmkf_ai_runs', { foo: 'bar' });
    expect(lastRequestHeaders().MSCRMCallerID).toBeUndefined();
  });

  test('updateRecord adds the header alongside If-Match', async () => {
    await DynamicsService.updateRecord(
      'akoya_requests',
      'guid',
      { wmkf_ai_summary: 'hi' },
      { ifMatch: 'W/"123"', actingUserSystemId: ACTING_GUID },
    );
    const h = lastRequestHeaders();
    expect(h.MSCRMCallerID).toBe(ACTING_GUID);
    expect(h['If-Match']).toBe('W/"123"');
  });

  test('deleteRecord adds the header', async () => {
    await DynamicsService.deleteRecord('wmkf_ai_runs', 'guid', { actingUserSystemId: ACTING_GUID });
    expect(lastRequestHeaders().MSCRMCallerID).toBe(ACTING_GUID);
  });

  test('reads do not receive the header even if a future caller mistakenly forwards it', async () => {
    // queryRecords path — buildHeaders is read-only and never includes MSCRMCallerID.
    fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 't', expires_in: 3600 }) }),
    );
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: [], '@odata.count': 0 }),
      }),
    );

    await withDynamicsContext({ restrictions: [], requestId: 'test' }, () =>
      DynamicsService.queryRecords('wmkf_ai_runs', { top: 1 }),
    );
    expect(lastRequestHeaders().MSCRMCallerID).toBeUndefined();
  });
});
