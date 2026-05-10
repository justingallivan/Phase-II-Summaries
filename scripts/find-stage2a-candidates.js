#!/usr/bin/env node
/**
 * Find wmkf_appreviewersuggestion rows currently in stage2a state — i.e.
 * suitable for a live browser smoke of the Stage 2a invitation flow.
 *
 * Pre-materials state criteria (mirrors computeEngagementState in
 * /api/external/review/[token]/context.js):
 *   - wmkf_reviewstatus is null OR < 100000001 (materials_sent)
 *   - wmkf_accepted != true AND wmkf_declined != true
 *   - wmkf_reviewreceivedat is null
 *   - wmkf_responsetype != 100000003 (withdrawn_sufficient)
 *
 * Token status is reported but NOT filtered — we want all candidates,
 * including ones with no token / expired token (we'll mint fresh).
 *
 * Modes:
 *   node scripts/find-stage2a-candidates.js                # list (default 10)
 *   node scripts/find-stage2a-candidates.js list 20        # list more
 *   node scripts/find-stage2a-candidates.js mint <id>      # mint fresh token, print URL
 */

require('./../lib/dataverse/client').loadEnvLocal();

(async () => {
  const mode = process.argv[2] === 'mint' ? 'mint' : 'list';
  const arg = process.argv[3];

  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

  return bypassDynamicsRestrictions('smoke', async () => {
    if (mode === 'mint') {
      const suggestionId = arg;
      if (!suggestionId) {
        console.error('mint mode requires a suggestion id: node scripts/find-stage2a-candidates.js mint <id>');
        process.exit(2);
      }

      const sug = await DynamicsService.getRecord('wmkf_appreviewersuggestions', suggestionId, {
        select: '_wmkf_request_value,wmkf_reviewstatus,wmkf_accepted,wmkf_declined,wmkf_reviewreceivedat,wmkf_responsetype',
      }).catch((e) => {
        console.error('Could not fetch suggestion:', e.message);
        process.exit(2);
      });

      // Sanity-check it's actually pre-materials (we don't want to overwrite a
      // live token on a row that's already past Stage 2a).
      const reviewStatus = sug.wmkf_reviewstatus;
      const inPreMaterials =
        (reviewStatus === null || reviewStatus === undefined || reviewStatus < 100000001)
        && sug.wmkf_accepted !== true
        && sug.wmkf_declined !== true
        && !sug.wmkf_reviewreceivedat
        && sug.wmkf_responsetype !== 100000003;

      if (!inPreMaterials) {
        console.error('Refusing to mint: suggestion is NOT in pre-materials state.');
        console.error('  reviewstatus =', reviewStatus);
        console.error('  accepted     =', sug.wmkf_accepted);
        console.error('  declined     =', sug.wmkf_declined);
        console.error('  reviewreceivedat =', sug.wmkf_reviewreceivedat);
        console.error('  responsetype =', sug.wmkf_responsetype);
        console.error('Pick a different suggestion or use the staff "flip back to pre-materials" path first.');
        process.exit(2);
      }

      // Inline mint to avoid ESM resolution issues under raw `node`. Mirrors
      // mintAndStore in lib/external/token-lifecycle.js + mintToken in
      // lib/services/external-token.js.
      const { SignJWT } = await import('jose');
      const { createHash, randomBytes } = await import('crypto');

      const secret = process.env.EXTERNAL_LINK_SECRET;
      if (!secret || secret.length < 32) {
        console.error('EXTERNAL_LINK_SECRET missing or too short (need >= 32 chars)');
        process.exit(2);
      }

      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      const jti = randomBytes(16).toString('hex');
      const expSeconds = Math.floor(expiresAt.getTime() / 1000);

      const jwt = await new SignJWT({
        sub: suggestionId,
        req: sug._wmkf_request_value,
        ops: ['download_proposal', 'upload_review'],
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime(expSeconds)
        .setJti(jti)
        .sign(new TextEncoder().encode(secret));

      const hash = createHash('sha256').update(jwt).digest('hex');

      await DynamicsService.updateRecord('wmkf_appreviewersuggestions', suggestionId, {
        wmkf_externaltokenhash: hash,
        wmkf_externaltokenissued: new Date().toISOString(),
        wmkf_externaltokenexpires: expiresAt.toISOString(),
        wmkf_externaltokenrevoked: false,
      });

      const base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
      const url = `${base}/external/review/${jwt}`;
      const actualExpires = expiresAt;

      console.log('\n=== Token minted ===');
      console.log('Suggestion :', suggestionId);
      console.log('Expires    :', actualExpires.toISOString());
      console.log('URL        :', url);
      console.log('\n(JWT length:', jwt.length, 'chars)');
      console.log('\nPaste the URL above into your browser to begin Stage 2a smoke.');
      return;
    }

    // list mode
    const count = parseInt(arg, 10) || 10;
    const filterParts = [
      '(wmkf_reviewstatus eq null or wmkf_reviewstatus lt 100000001)',
      '(wmkf_accepted eq false or wmkf_accepted eq null)',
      '(wmkf_declined eq false or wmkf_declined eq null)',
      'wmkf_reviewreceivedat eq null',
      '(wmkf_responsetype eq null or wmkf_responsetype ne 100000003)',
    ];

    const { records } = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
      select: [
        'wmkf_appreviewersuggestionid',
        'wmkf_suggestionlabel',
        'wmkf_externaltokenhash',
        'wmkf_externaltokenexpires',
        'wmkf_externaltokenrevoked',
        'wmkf_proposalfirstaccessed',
        'wmkf_reviewstatus',
        'wmkf_accepted',
        'wmkf_declined',
        'wmkf_responsetype',
        'createdon',
        '_wmkf_potentialreviewer_value',
        '_wmkf_request_value',
      ].join(','),
      filter: filterParts.join(' and '),
      orderby: 'createdon desc',
      top: count,
    });

    if (!records.length) {
      console.log('No pre-materials suggestions found.');
      console.log('You can create one via Reviewer Finder → save candidates flow.');
      return;
    }

    console.log(`\n=== ${records.length} pre-materials candidate(s) ===\n`);
    const now = Date.now();

    for (const s of records) {
      const prId = s._wmkf_potentialreviewer_value;
      const reqId = s._wmkf_request_value;

      const pr = prId
        ? await DynamicsService.getRecord('wmkf_potentialreviewerses', prId, {
            select: 'wmkf_name,wmkf_emailaddress,wmkf_organizationname',
          }).catch(() => null)
        : null;

      const req = reqId
        ? await DynamicsService.getRecord('akoya_requests', reqId, {
            select: 'akoya_requestnum,akoya_title,akoya_requeststatus',
          }).catch(() => null)
        : null;

      let tokenState = 'no-token';
      if (s.wmkf_externaltokenhash) {
        if (s.wmkf_externaltokenrevoked) tokenState = 'revoked';
        else if (s.wmkf_externaltokenexpires && new Date(s.wmkf_externaltokenexpires).getTime() < now) tokenState = 'expired';
        else tokenState = 'LIVE (but JWT not stored — must re-mint to get URL)';
      }

      console.log('---');
      console.log('  id:        ', s.wmkf_appreviewersuggestionid);
      console.log('  reviewer:  ', pr ? `${pr.wmkf_name} <${pr.wmkf_emailaddress}>` : '(missing)');
      console.log('  request:   ', req ? `${req.akoya_requestnum} — ${req.akoya_title}` : reqId);
      console.log('  status:    ', req?.akoya_requeststatus || '?');
      console.log('  token:     ', tokenState);
      console.log('  first-acc: ', s.wmkf_proposalfirstaccessed || '(never)');
      console.log('  created:   ', s.createdon);
    }

    console.log('\nTo mint a fresh token on one of these and get a smoke URL:');
    console.log('  node scripts/find-stage2a-candidates.js mint <suggestionId>');
  });
})().catch((e) => {
  console.error('Probe failed:', e.message);
  process.exit(1);
});
