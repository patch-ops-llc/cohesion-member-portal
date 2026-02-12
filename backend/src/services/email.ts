import { Resend } from 'resend';
import { logger } from '../utils/logger';
import prisma from '../db/client';

let resendInstance: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';
const fromName = process.env.FROM_NAME || 'Cohesion Portal';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const adminEmails = (process.env.ADMIN_NOTIFICATION_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

// ─── Shared HTML wrapper ───────────────────────────────────────────────
function wrapHtml(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e3a5f; color: #ffffff; padding: 24px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
    .body { padding: 32px; line-height: 1.6; }
    .body p { margin: 0 0 16px; }
    .btn { display: inline-block; background: #1e3a5f; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; margin: 8px 0; }
    .btn:hover { background: #2a4d7a; }
    .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }
    .status-pending { background: #fef3cd; color: #856404; }
    .status-accepted { background: #d4edda; color: #155724; }
    .detail-row { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-label { font-weight: 600; color: #555; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 12px; }
  </style>
</head>
<body>
  <div style="padding: 20px;">
    <div class="container">
      <div class="header">
        <h1>Cohesion Document Portal</h1>
      </div>
      <div class="body">
        ${body}
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Cohesion. All rights reserved.<br/>
        <a href="${frontendUrl}" style="color: #1e3a5f;">Visit Portal</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Preference check helper ───────────────────────────────────────────
async function shouldSendToUser(email: string, type: string): Promise<boolean> {
  try {
    const prefs = await prisma.notificationPreference.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!prefs) return true; // default all on
    switch (type) {
      case 'password_reset': return prefs.passwordReset;
      case 'portal_registration': return prefs.portalRegistration;
      case 'document_submission': return prefs.documentSubmission;
      case 'weekly_update': return prefs.weeklyUpdate;
      default: return true;
    }
  } catch {
    return true;
  }
}

async function getAdminRecipientsFor(type: string): Promise<string[]> {
  if (adminEmails.length === 0) return [];
  const recipients: string[] = [];
  for (const email of adminEmails) {
    try {
      const prefs = await prisma.notificationPreference.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!prefs) { recipients.push(email); continue; } // default all on
      switch (type) {
        case 'admin_registration': if (prefs.adminRegistration) recipients.push(email); break;
        case 'admin_document_submission': if (prefs.adminDocumentSubmission) recipients.push(email); break;
        case 'admin_weekly_update': if (prefs.adminWeeklyUpdate) recipients.push(email); break;
        default: recipients.push(email);
      }
    } catch {
      recipients.push(email);
    }
  }
  return recipients;
}

// ─── Core send function ────────────────────────────────────────────────
async function sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) return;

  try {
    const resend = getResend();
    if (!resend) {
      logger.warn('Resend not configured - email would be sent', { to: recipients, subject });
      return;
    }

    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipients,
      subject,
      html
    });

    if (error) {
      logger.error('Failed to send email', { to: recipients, subject, error });
      throw error;
    }

    logger.info('Email sent', { to: recipients, subject, id: data?.id });
  } catch (error) {
    logger.error('Email send failed', { to: recipients, subject, error: String(error) });
    throw error;
  }
}

// ─── PASSWORD RESET ────────────────────────────────────────────────────
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const allowed = await shouldSendToUser(email, 'password_reset');
  if (!allowed) {
    logger.info('Password reset email suppressed by preference', { email });
    return;
  }

  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const html = wrapHtml(`
    <p>Hi there,</p>
    <p>You requested a password reset for your Cohesion Portal account.</p>
    <p>Click the button below to set a new password:</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </p>
    <p style="font-size: 13px; color: #666;">
      Or copy this link: <a href="${resetUrl}" style="color: #1e3a5f;">${resetUrl}</a>
    </p>
    <p style="font-size: 13px; color: #999;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `);

  await sendEmail(email, 'Reset your password - Cohesion Portal', html);
}

// ─── PORTAL REGISTRATION (user) ───────────────────────────────────────
export async function sendRegistrationEmail(email: string, displayName: string): Promise<void> {
  const allowed = await shouldSendToUser(email, 'portal_registration');
  if (!allowed) return;

  const html = wrapHtml(`
    <p>Hi ${displayName || 'there'},</p>
    <p>Welcome to the Cohesion Document Portal! Your account has been created successfully.</p>
    <p>You can now log in to view your projects, upload documents, and track your tax return progress.</p>
    <p style="text-align: center;">
      <a href="${frontendUrl}/login" class="btn">Go to Portal</a>
    </p>
    <p style="font-size: 13px; color: #666;">If you didn't create this account, please contact our team.</p>
  `);

  await sendEmail(email, 'Welcome to Cohesion Portal', html);
}

// ─── PORTAL REGISTRATION (admin) ──────────────────────────────────────
export async function sendAdminRegistrationNotification(userEmail: string, displayName: string): Promise<void> {
  const recipients = await getAdminRecipientsFor('admin_registration');
  if (recipients.length === 0) return;

  const html = wrapHtml(`
    <p>A new client has registered on the Cohesion Portal:</p>
    <table>
      <tr>
        <td class="detail-label">Name</td>
        <td>${displayName || 'N/A'}</td>
      </tr>
      <tr>
        <td class="detail-label">Email</td>
        <td>${userEmail}</td>
      </tr>
      <tr>
        <td class="detail-label">Time</td>
        <td>${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</td>
      </tr>
    </table>
    <p style="text-align: center; margin-top: 24px;">
      <a href="${frontendUrl}/admin/projects" class="btn">View in Admin Portal</a>
    </p>
  `);

  await sendEmail(recipients, 'New Portal Registration - ' + (displayName || userEmail), html);
}

// ─── DOCUMENT SUBMISSION (user) ────────────────────────────────────────
export async function sendDocumentSubmissionEmail(
  email: string,
  displayName: string,
  projectName: string,
  categoryLabel: string,
  documentName: string,
  filename: string
): Promise<void> {
  const allowed = await shouldSendToUser(email, 'document_submission');
  if (!allowed) return;

  const html = wrapHtml(`
    <p>Hi ${displayName || 'there'},</p>
    <p>Your document has been submitted successfully!</p>
    <table>
      <tr>
        <td class="detail-label">Project</td>
        <td>${projectName}</td>
      </tr>
      <tr>
        <td class="detail-label">Category</td>
        <td>${categoryLabel}</td>
      </tr>
      <tr>
        <td class="detail-label">Document</td>
        <td>${documentName}</td>
      </tr>
      <tr>
        <td class="detail-label">File</td>
        <td>${filename}</td>
      </tr>
      <tr>
        <td class="detail-label">Status</td>
        <td><span class="status-badge status-pending">Pending Review</span></td>
      </tr>
    </table>
    <p>Our team will review your submission shortly. You'll be notified once it's processed.</p>
    <p style="text-align: center;">
      <a href="${frontendUrl}" class="btn">View Your Projects</a>
    </p>
  `);

  await sendEmail(email, `Document Submitted: ${documentName} - ${projectName}`, html);
}

// ─── DOCUMENT SUBMISSION (admin) ───────────────────────────────────────
export async function sendAdminDocumentSubmissionNotification(
  userEmail: string,
  displayName: string,
  projectName: string,
  projectId: string,
  categoryLabel: string,
  documentName: string,
  filename: string
): Promise<void> {
  const recipients = await getAdminRecipientsFor('admin_document_submission');
  if (recipients.length === 0) return;

  const html = wrapHtml(`
    <p>A client has submitted a document:</p>
    <table>
      <tr>
        <td class="detail-label">Client</td>
        <td>${displayName || userEmail}</td>
      </tr>
      <tr>
        <td class="detail-label">Project</td>
        <td>${projectName}</td>
      </tr>
      <tr>
        <td class="detail-label">Category</td>
        <td>${categoryLabel}</td>
      </tr>
      <tr>
        <td class="detail-label">Document</td>
        <td>${documentName}</td>
      </tr>
      <tr>
        <td class="detail-label">File</td>
        <td>${filename}</td>
      </tr>
      <tr>
        <td class="detail-label">Time</td>
        <td>${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</td>
      </tr>
    </table>
    <p style="text-align: center; margin-top: 24px;">
      <a href="${frontendUrl}/admin/projects/${projectId}" class="btn">Review in Admin</a>
    </p>
  `);

  await sendEmail(recipients, `Document Submitted by ${displayName || userEmail} - ${projectName}`, html);
}

// ─── WEEKLY UPDATE (user) ──────────────────────────────────────────────
export interface WeeklyProjectSummary {
  projectName: string;
  totalDocs: number;
  pendingDocs: number;
  acceptedDocs: number;
  actionNeeded: number;
  stage: string;
}

export async function sendWeeklyUpdateEmail(
  email: string,
  displayName: string,
  projects: WeeklyProjectSummary[]
): Promise<void> {
  const allowed = await shouldSendToUser(email, 'weekly_update');
  if (!allowed) return;

  const stageLabel = (s: string) => {
    switch (s) {
      case 'collecting': return 'Collecting Documents';
      case 'processing': return 'Processing Return';
      case 'submitted': return 'Return Submitted';
      case 'accepted': return 'Return Accepted';
      default: return s;
    }
  };

  const projectRows = projects.map(p => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <strong>${p.projectName}</strong><br/>
        <span style="font-size: 12px; color: #666;">${stageLabel(p.stage)}</span>
      </td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${p.totalDocs}</td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">
        <span class="status-badge status-accepted">${p.acceptedDocs}</span>
      </td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">
        <span class="status-badge status-pending">${p.pendingDocs}</span>
      </td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${p.actionNeeded}</td>
    </tr>
  `).join('');

  const html = wrapHtml(`
    <p>Hi ${displayName || 'there'},</p>
    <p>Here's your weekly update on your Cohesion Document Portal projects:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f8f9fa;">
        <th style="padding: 10px 12px; text-align: left; font-size: 13px;">Project</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Total</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Accepted</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Pending</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Action</th>
      </tr>
      ${projectRows}
    </table>
    <p style="text-align: center;">
      <a href="${frontendUrl}" class="btn">View Your Projects</a>
    </p>
    <p style="font-size: 12px; color: #999;">You can manage your notification preferences in the portal settings.</p>
  `);

  await sendEmail(email, 'Your Weekly Cohesion Portal Update', html);
}

// ─── WEEKLY UPDATE (admin) ─────────────────────────────────────────────
export interface AdminWeeklySummary {
  totalProjects: number;
  activeProjects: number;
  totalPending: number;
  totalAccepted: number;
  newRegistrations: number;
  newUploads: number;
}

export async function sendAdminWeeklyUpdateEmail(summary: AdminWeeklySummary): Promise<void> {
  const recipients = await getAdminRecipientsFor('admin_weekly_update');
  if (recipients.length === 0) return;

  const html = wrapHtml(`
    <p>Here's your weekly Cohesion Portal admin summary:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f8f9fa;">
        <td style="padding: 12px; font-weight: 600;">Total Projects</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">${summary.totalProjects}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: 600;">Active Projects</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">${summary.activeProjects}</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="padding: 12px; font-weight: 600;">Pending Review</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700; color: #856404;">${summary.totalPending}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: 600;">Accepted</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700; color: #155724;">${summary.totalAccepted}</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="padding: 12px; font-weight: 600;">New Registrations (7d)</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">${summary.newRegistrations}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: 600;">New Uploads (7d)</td>
        <td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">${summary.newUploads}</td>
      </tr>
    </table>
    <p style="text-align: center;">
      <a href="${frontendUrl}/admin" class="btn">Open Admin Dashboard</a>
    </p>
  `);

  await sendEmail(recipients, 'Weekly Cohesion Portal Admin Summary', html);
}
