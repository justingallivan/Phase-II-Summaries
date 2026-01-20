/**
 * Preference keys for Reviewer Finder settings stored in user_preferences table.
 * These settings are per-user and stored in the database when a profile is selected.
 */
export const PREFERENCE_KEYS = {
  SENDER_INFO: 'reviewer_finder_sender_info',
  GRANT_CYCLE_SETTINGS: 'reviewer_finder_grant_cycle_settings',
  EMAIL_TEMPLATE: 'reviewer_finder_email_template',
  CURRENT_CYCLE_ID: 'reviewer_finder_current_cycle_id',
};

/**
 * Legacy localStorage keys used before database storage.
 * These keys are used for fallback when no profile is selected,
 * and for migration when a user first selects a profile.
 */
export const STORAGE_KEYS = {
  SENDER_INFO: 'email_sender_info',
  GRANT_CYCLE: 'email_grant_cycle',
  EMAIL_TEMPLATE: 'email_reviewer_template',
  CURRENT_CYCLE: 'reviewer_finder_current_cycle',
};

/**
 * Default values for settings
 */
export const DEFAULT_VALUES = {
  SENDER_INFO: {
    name: '',
    email: '',
    signature: '',
  },
  GRANT_CYCLE_SETTINGS: {
    programName: 'W. M. Keck Foundation',
    reviewDeadline: '',
    summaryPages: '2',
    customFields: [],
    attachments: {
      reviewTemplate: null,
      additionalFiles: [],
    },
  },
  EMAIL_TEMPLATE: {
    subject: 'Invitation to Review {{programName}} Research Grant Proposal',
    body: `{{greeting}},

I am reaching out on behalf of the {{programName}} to invite you to serve as an external reviewer for a research grant proposal.

{{investigatorTeam}} submitted a proposal titled "{{proposalTitle}}" which falls within your area of expertise.

{{#if reviewDeadline}}
We would need your review by {{reviewDeadline}}.
{{/if}}

Please let me know at your earliest convenience if you are available and willing to serve as a reviewer.

Thank you for considering this invitation.

{{signature}}`,
  },
};
