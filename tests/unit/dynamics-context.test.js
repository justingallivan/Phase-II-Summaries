/**
 * Regression test for the Wave 2 #5 restriction-context refactor.
 *
 * Before this refactor, restrictions lived in module-level globals on
 * `dynamics-service.js`, so two concurrent requests arriving at the same
 * Fluid Compute instance could race — one request's restrictions would leak
 * into another's queries. AsyncLocalStorage gives every `withDynamicsContext`
 * scope its own store, threaded through awaits automatically.
 *
 * The two tests here pin that behavior so a future refactor that reverts to
 * module state will fail loudly.
 */

import {
  withDynamicsContext,
  bypassDynamicsRestrictions,
  getDynamicsContext,
} from '../../lib/services/dynamics-context.js';

describe('dynamics-context (AsyncLocalStorage)', () => {
  test('outside any context, the store is null', () => {
    expect(getDynamicsContext()).toBeNull();
  });

  test('two concurrent contexts do not leak restrictions across awaits', async () => {
    // Each task installs its own restriction set, then yields and reads the
    // context back. If ALS is wired correctly, each task sees only its own
    // store regardless of interleaving order. If anyone reverts to module
    // globals, whichever task installs its restrictions last will overwrite
    // the other and one of these reads will see the wrong array.

    async function taskWithRestrictions(label, restrictions, delayMs) {
      return withDynamicsContext({ restrictions, requestId: label }, async () => {
        // Yield twice with different delays to maximize interleaving.
        await new Promise((r) => setTimeout(r, delayMs));
        const ctx1 = getDynamicsContext();
        await new Promise((r) => setTimeout(r, delayMs));
        const ctx2 = getDynamicsContext();
        return { label, ctx1, ctx2 };
      });
    }

    const restrictionsA = [{ table_name: 'akoya_request', field_name: 'wmkf_secret' }];
    const restrictionsB = [{ table_name: 'contact' }]; // table-level block

    const [a, b] = await Promise.all([
      taskWithRestrictions('A', restrictionsA, 5),
      taskWithRestrictions('B', restrictionsB, 2),
    ]);

    expect(a.ctx1).toEqual({ restrictions: restrictionsA, requestId: 'A' });
    expect(a.ctx2).toEqual({ restrictions: restrictionsA, requestId: 'A' });
    expect(b.ctx1).toEqual({ restrictions: restrictionsB, requestId: 'B' });
    expect(b.ctx2).toEqual({ restrictions: restrictionsB, requestId: 'B' });
  });

  test('bypassDynamicsRestrictions installs an empty restriction array', async () => {
    const result = await bypassDynamicsRestrictions('test-bypass', async () => {
      return getDynamicsContext();
    });
    expect(result).toEqual({ restrictions: [], requestId: 'test-bypass' });
  });

  test('nested contexts replace then restore the outer store', async () => {
    const outer = [{ table_name: 'outer' }];
    const inner = [{ table_name: 'inner' }];

    const reads = [];
    await withDynamicsContext({ restrictions: outer, requestId: 'outer' }, async () => {
      reads.push(getDynamicsContext());
      await withDynamicsContext({ restrictions: inner, requestId: 'inner' }, async () => {
        reads.push(getDynamicsContext());
      });
      reads.push(getDynamicsContext());
    });

    expect(reads).toEqual([
      { restrictions: outer, requestId: 'outer' },
      { restrictions: inner, requestId: 'inner' },
      { restrictions: outer, requestId: 'outer' },
    ]);
  });

  test('withDynamicsContext rejects malformed input', () => {
    expect(() => withDynamicsContext({}, () => {})).toThrow(/restrictions must be an Array/);
    expect(() => withDynamicsContext({ restrictions: [] }, null)).toThrow(/fn must be a function/);
  });
});
