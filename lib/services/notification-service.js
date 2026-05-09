/**
 * NotificationService — unified system-alert notification.
 *
 * Two-channel design:
 *   1. Always: store as a `system_alerts` row (visible on /admin dashboard).
 *   2. Conditional: also send an email to the active App Suite admin roster
 *      (severity error/critical, OR caller-opted-in via `emailAdmins: true`).
 *
 * Recipient discovery is dynamic — the admin roster is the set of active
 * superusers in `dynamics_user_roles`, joined to `user_profiles` for the
 * email address. When admins change (Justin leaves, successor is granted
 * superuser via /admin), recipients self-heal with no env-var update.
 *
 * Sender is a configured mailbox (`NOTIFICATION_EMAIL_FROM`). It must be a
 * Dynamics systemuser with Server-Side Sync enabled for outgoing email
 * (i.e. an `internalemailaddress` resolvable via DynamicsService.resolveSystemUser).
 *
 * Transport is `DynamicsService.createAndSendEmail`, which uses the org's
 * already-granted Dynamics privileges. The previous Microsoft Graph
 * `Mail.Send` path was retired in S142 — that permission was never granted
 * and the Dynamics path covers every current use case.
 */

const { sql } = require('@vercel/postgres');
const AlertService = require('./alert-service');
const { DynamicsService } = require('./dynamics-service');

class NotificationService {
  /**
   * Send a notification — stores alert in DB + emails admins if appropriate.
   *
   * @param {Object} opts
   * @param {string} opts.type - Alert type
   * @param {string} opts.severity - info, warning, error, critical
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {Object} [opts.metadata]
   * @param {string} [opts.source]
   * @param {string} [opts.autoResolveKey]
   * @param {boolean} [opts.emailAdmins] - Force email even at info/warning severity.
   *   Set true for events admins must see proactively (e.g. new-user signups).
   * @returns {Object|null} Created alert or null if deduplicated
   */
  static async notify({
    type,
    severity = 'info',
    title,
    message,
    metadata,
    source,
    autoResolveKey,
    emailAdmins = false,
  }) {
    const alert = await AlertService.createAlert({
      type, severity, title, message, metadata, source, autoResolveKey,
    });

    const shouldEmail =
      alert && (emailAdmins || severity === 'error' || severity === 'critical');

    if (shouldEmail && this.isEmailEnabled()) {
      try {
        await this.sendAdminEmail({
          subject: `[${severity.toUpperCase()}] ${title}`,
          htmlBody: this._formatEmailBody({ type, severity, title, message, metadata }),
        });
      } catch (error) {
        // Email is best-effort; the dashboard alert is the durable record.
        console.error('NotificationService email failed (alert still stored):', error.message);
      }
    }

    return alert;
  }

  /**
   * True when email sending is configured and likely to work.
   *
   * No `NOTIFICATION_EMAIL_TO` requirement — recipients come from the active
   * superuser roster at send time. The sender mailbox + Dynamics credentials
   * are the only durable configuration.
   */
  static isEmailEnabled() {
    return !!(
      process.env.NOTIFICATION_EMAIL_FROM &&
      process.env.DYNAMICS_URL &&
      process.env.DYNAMICS_TENANT_ID &&
      process.env.DYNAMICS_CLIENT_ID &&
      process.env.DYNAMICS_CLIENT_SECRET
    );
  }

  /**
   * Look up the current admin email roster.
   *
   * Returns the email addresses of all active superusers — the people who
   * can grant app access via /admin and who therefore need visibility into
   * new-user signups and operational alerts. Self-healing: when superuser
   * grants change, recipients change with no code or config update.
   *
   * @returns {Promise<string[]>}
   */
  static async getAdminRecipients() {
    const result = await sql`
      SELECT DISTINCT p.azure_email
      FROM user_profiles p
      JOIN dynamics_user_roles r ON r.user_profile_id = p.id
      WHERE r.role = 'superuser'
        AND p.is_active = true
        AND p.azure_email IS NOT NULL
    `;
    return result.rows.map((row) => row.azure_email);
  }

  /**
   * Send a notification email via Dynamics to the current admin roster.
   *
   * No-op (with log) when no sender is configured or no superusers exist.
   * Throws on Dynamics failure so the caller can decide whether to swallow;
   * `notify()` swallows by design (alert still stored).
   */
  static async sendAdminEmail({ subject, htmlBody }) {
    const sender = process.env.NOTIFICATION_EMAIL_FROM;
    if (!sender) {
      console.log(`NotificationService.sendAdminEmail skipped (no sender configured): "${subject}"`);
      return false;
    }

    const recipients = await this.getAdminRecipients();
    if (recipients.length === 0) {
      console.log(`NotificationService.sendAdminEmail skipped (no active superusers): "${subject}"`);
      return false;
    }

    await DynamicsService.createAndSendEmail({
      subject,
      body: htmlBody,
      from: sender,
      to: recipients,
    });

    console.log(
      `NotificationService email sent: "${subject}" from ${sender} to ${recipients.length} admin(s)`,
    );
    return true;
  }

  /**
   * Convenience method: notify admins of a new user sign-in.
   *
   * Forces email (`emailAdmins: true`) even though severity is `info`,
   * because admins need to know proactively so they can grant additional
   * app access without waiting for the user to ask.
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
      emailAdmins: true,
    });
  }

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
