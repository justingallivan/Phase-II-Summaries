/**
 * NotificationService - Unified notification interface
 *
 * Stores all notifications as alerts in the database. When Microsoft Graph
 * email is configured (Mail.Send permission granted), also sends emails.
 *
 * Replaces the standalone approach in docs/TODO_EMAIL_NOTIFICATIONS.md
 * with a unified service that works now (dashboard alerts) and extends
 * later (email via Graph API).
 */

const AlertService = require('./alert-service');

class NotificationService {
  /**
   * Send a notification — stores alert in DB + sends email if configured.
   *
   * @param {Object} opts
   * @param {string} opts.type - Alert type (health, maintenance, log_analysis, secret_expiration, new_user)
   * @param {string} opts.severity - info, warning, error, critical
   * @param {string} opts.title - Short title
   * @param {string} opts.message - Detailed message
   * @param {Object} [opts.metadata] - Additional data
   * @param {string} [opts.source] - Which cron/process
   * @param {string} [opts.autoResolveKey] - Deduplication key
   * @returns {Object|null} Created alert or null if deduplicated
   */
  static async notify({ type, severity = 'info', title, message, metadata, source, autoResolveKey }) {
    // Always store as alert in database
    const alert = await AlertService.createAlert({
      type, severity, title, message, metadata, source, autoResolveKey,
    });

    // Send email for error/critical alerts if configured
    if (alert && (severity === 'error' || severity === 'critical')) {
      if (this.isEmailEnabled()) {
        try {
          await this.sendEmail({
            subject: `[${severity.toUpperCase()}] ${title}`,
            htmlBody: this._formatEmailBody({ type, severity, title, message, metadata }),
          });
        } catch (error) {
          console.error('NotificationService email failed (alert still stored):', error.message);
        }
      }
    }

    return alert;
  }

  /**
   * Check whether email sending is configured and likely to work
   */
  static isEmailEnabled() {
    return !!(
      process.env.NOTIFICATION_EMAIL_FROM &&
      process.env.NOTIFICATION_EMAIL_TO &&
      process.env.DYNAMICS_TENANT_ID &&
      process.env.DYNAMICS_CLIENT_ID &&
      process.env.DYNAMICS_CLIENT_SECRET
    );
  }

  /**
   * Acquire a Microsoft Graph API token using client credentials.
   * Reuses the same app registration as Dynamics Explorer.
   */
  static async getGraphToken() {
    const response = await fetch(
      `https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.DYNAMICS_CLIENT_ID,
          client_secret: process.env.DYNAMICS_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      }
    );

    const data = await response.json();
    if (!data.access_token) {
      throw new Error(`Graph token failed: ${data.error || 'unknown error'}`);
    }
    return data.access_token;
  }

  /**
   * Send an email via Microsoft Graph API.
   * No-op with console log when email is not configured.
   */
  static async sendEmail({ to, subject, htmlBody }) {
    const recipient = to || process.env.NOTIFICATION_EMAIL_TO;
    const sender = process.env.NOTIFICATION_EMAIL_FROM;

    if (!sender || !recipient) {
      console.log(`NotificationService.sendEmail skipped (not configured): "${subject}"`);
      return false;
    }

    try {
      const token = await this.getGraphToken();

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'HTML', content: htmlBody },
              toRecipients: [{ emailAddress: { address: recipient } }],
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Graph sendMail ${response.status}: ${errText}`);
      }

      console.log(`NotificationService email sent: "${subject}" to ${recipient}`);
      return true;
    } catch (error) {
      console.error('NotificationService.sendEmail error:', error.message);
      throw error;
    }
  }

  /**
   * Convenience method: notify admin of a new user sign-in.
   * Creates a dashboard alert now; sends email when Graph API is available.
   */
  static async notifyNewUser(userProfile) {
    const { name, azure_email, id } = userProfile;
    return this.notify({
      type: 'new_user',
      severity: 'info',
      title: `New user: ${name || azure_email}`,
      message: `${name || 'Unknown'} (${azure_email || 'no email'}) signed in for the first time. They have been granted default app access. Visit the admin dashboard to grant additional apps.`,
      metadata: { profileId: id, name, email: azure_email },
      source: 'auth',
    });
  }

  /**
   * Format an HTML email body for notification emails
   */
  static _formatEmailBody({ type, severity, title, message, metadata }) {
    const severityColors = {
      info: '#3b82f6',
      warning: '#f59e0b',
      error: '#ef4444',
      critical: '#dc2626',
    };
    const color = severityColors[severity] || '#6b7280';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0;">
          <strong>${severity.toUpperCase()}</strong> &mdash; ${type.replace(/_/g, ' ')}
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 12px;">${title}</h2>
          ${message ? `<p style="color: #374151; line-height: 1.5;">${message}</p>` : ''}
          ${metadata ? `<pre style="background: #f9fafb; padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto;">${JSON.stringify(metadata, null, 2)}</pre>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
          <p style="color: #9ca3af; font-size: 12px;">
            Document Processing Suite &mdash; ${new Date().toISOString()}
          </p>
        </div>
      </div>
    `.trim();
  }
}

module.exports = NotificationService;
