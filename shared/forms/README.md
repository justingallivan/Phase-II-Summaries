# Forms-as-code

Each grant cycle's intake form is a versioned module under
`shared/forms/{form-key}/`. The directory name IS the `form_key` used by
`intake_drafts.form_key` and the form module exports.

```
shared/forms/
  phase-ii-research-2026-06/
    schema.js          single source of truth for field definitions
    Form.js            React renderer (consumes schema.js)              [to come]
    validate.js        server-side validator (consumes schema.js)       [to come]
    map-to-dynamics.js maps validated submission -> akoya_request PATCH [to come]
```

**Versioning rule:** once a form ships in production, its schema is frozen.
The next cycle gets a new directory + new key (`phase-ii-research-2026-12/`).
This makes historical submissions render correctly and lets us ship
mid-cycle field tweaks without migration.

See `docs/INTAKE_PORTAL_DESIGN.md` (Form strategy: forms-as-code).
