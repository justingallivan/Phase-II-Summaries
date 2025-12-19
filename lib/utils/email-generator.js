/**
 * Email Generator Utilities
 *
 * Functions for generating .eml files and processing email templates
 * for the Expert Reviewer Finder email feature.
 */

/**
 * Generate EML file content with proper RFC 2822 headers
 *
 * @param {Object} options - Email options
 * @param {string} options.from - Sender email (or "Name <email>" format)
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject line
 * @param {string} options.body - Email body text
 * @param {Date} options.date - Optional date (defaults to now)
 * @returns {string} Complete .eml file content
 */
function generateEmlContent({ from, to, subject, body, date }) {
  // Format date according to RFC 2822
  const emailDate = date || new Date();
  const formattedDate = emailDate.toUTCString().replace('GMT', '+0000');

  // Encode subject if it contains non-ASCII characters
  const encodedSubject = containsNonAscii(subject)
    ? `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
    : subject;

  return `From: ${from}
To: ${to}
Subject: ${encodedSubject}
Date: ${formattedDate}
MIME-Version: 1.0
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: 8bit

${body}`;
}

/**
 * Check if string contains non-ASCII characters
 */
function containsNonAscii(str) {
  return /[^\x00-\x7F]/.test(str);
}

/**
 * Replace placeholders in a template string
 *
 * Placeholders use the format {{placeholderName}}
 *
 * @param {string} template - Template string with placeholders
 * @param {Object} data - Key-value pairs for replacement
 * @returns {string} Template with placeholders replaced
 */
function replacePlaceholders(template, data) {
  if (!template) return '';

  return template.replace(/\{\{(\w+(?::\w+)?)\}\}/g, (match, key) => {
    // Handle custom fields: {{customField:fieldName}}
    if (key.startsWith('customField:')) {
      const fieldName = key.split(':')[1];
      return data.customFields?.[fieldName] || match;
    }

    // Direct key lookup
    if (data.hasOwnProperty(key)) {
      return data[key] || '';
    }

    // Return original placeholder if not found
    return match;
  });
}

/**
 * Parse a full name to extract components for email personalization
 *
 * @param {string} fullName - Full name (e.g., "Dr. Kevin Weeks", "Jane Smith")
 * @returns {Object} { fullName, firstName, lastName, salutation, cleanName }
 */
function parseRecipientName(fullName) {
  if (!fullName) {
    return {
      fullName: '',
      firstName: '',
      lastName: '',
      salutation: 'Dr.',
      cleanName: ''
    };
  }

  // Detect and extract honorific
  const honorificMatch = fullName.match(/^(Dr\.?|Prof\.?|Professor|Mr\.?|Ms\.?|Mrs\.?)\s+/i);
  let salutation = 'Dr.'; // Default to Dr. for academics
  let cleanName = fullName;

  if (honorificMatch) {
    const honorific = honorificMatch[1].toLowerCase();
    if (honorific.startsWith('prof')) {
      salutation = 'Professor';
    } else if (honorific.startsWith('dr')) {
      salutation = 'Dr.';
    } else if (honorific.startsWith('mr')) {
      salutation = 'Mr.';
    } else if (honorific.startsWith('ms')) {
      salutation = 'Ms.';
    } else if (honorific.startsWith('mrs')) {
      salutation = 'Mrs.';
    }
    cleanName = fullName.replace(honorificMatch[0], '').trim();
  }

  // Split into parts
  const parts = cleanName.split(/\s+/).filter(p => p.length > 0);

  return {
    fullName: fullName,
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : parts[0] || '',
    salutation,
    cleanName
  };
}

/**
 * Format a date string for display in emails
 *
 * @param {string|Date} dateInput - Date string or Date object
 * @param {string} format - 'short' (Jan 15, 2025) or 'long' (January 15, 2025)
 * @returns {string} Formatted date string
 */
function formatReviewDeadline(dateInput, format = 'long') {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

  if (isNaN(date.getTime())) {
    return dateInput; // Return original if invalid
  }

  const options = format === 'short'
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };

  return date.toLocaleDateString('en-US', options);
}

/**
 * Create a safe filename from a name
 *
 * @param {string} name - Person's name
 * @returns {string} Safe filename (e.g., "Kevin_Weeks.eml")
 */
function createFilename(name) {
  if (!name) return 'draft.eml';

  // Remove honorifics
  const cleaned = name.replace(/^(Dr\.?|Prof\.?|Professor|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '');

  // Replace spaces with underscores, remove special characters
  const safe = cleaned
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');

  return `${safe}.eml`;
}

/**
 * Build the complete data object for template replacement
 *
 * @param {Object} candidate - Candidate object with name, affiliation, etc.
 * @param {Object} proposal - Proposal object with title, abstract, authors, etc.
 * @param {Object} settings - Email settings with signature, grantCycle, etc.
 * @returns {Object} Complete data object for replacePlaceholders()
 */
function buildTemplateData(candidate, proposal, settings) {
  const parsed = parseRecipientName(candidate.name);

  return {
    // Recipient info
    recipientName: parsed.cleanName,
    recipientFirstName: parsed.firstName,
    recipientLastName: parsed.lastName,
    salutation: parsed.salutation,
    recipientEmail: candidate.email || '',
    recipientAffiliation: candidate.affiliation || '',
    recipientExpertise: Array.isArray(candidate.expertiseAreas)
      ? candidate.expertiseAreas.join(', ')
      : (candidate.expertise || ''),

    // Proposal info
    proposalTitle: proposal.title || proposal.proposalTitle || '',
    proposalAbstract: proposal.abstract || proposal.proposalAbstract || '',
    piName: proposal.authors || proposal.proposalAuthors || '',
    piInstitution: proposal.institution || proposal.proposalInstitution || proposal.authorInstitution || '',

    // Settings
    programName: settings.grantCycle?.programName || '',
    reviewDeadline: formatReviewDeadline(settings.grantCycle?.reviewDeadline),
    signature: settings.signature || '',

    // Custom fields from grant cycle settings
    customFields: settings.grantCycle?.customFields || {}
  };
}

/**
 * Default email template
 */
const DEFAULT_TEMPLATE = {
  subject: 'Invitation to Review: {{proposalTitle}}',
  body: `Dear {{salutation}} {{recipientLastName}},

I am writing to invite you to serve as an expert reviewer for the {{programName}}.

Proposal Title: {{proposalTitle}}
Principal Investigator: {{piName}}, {{piInstitution}}

Abstract:
{{proposalAbstract}}

Please respond by {{reviewDeadline}} to confirm your availability.

{{signature}}`
};

module.exports = {
  generateEmlContent,
  replacePlaceholders,
  parseRecipientName,
  formatReviewDeadline,
  createFilename,
  buildTemplateData,
  DEFAULT_TEMPLATE
};
