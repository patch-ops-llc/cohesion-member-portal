import { Resend } from 'resend';
import { logger } from '../utils/logger';
import prisma from '../db/client';
import { DEFAULT_TEMPLATES } from './emailTemplateDefaults';
import { getAdminEmails } from './settings';

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
const frontendUrl = process.env.FRONTEND_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
  || 'http://localhost:5173';

// ─── Template loader ──────────────────────────────────────────────────
interface LoadedTemplate {
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
}

async function loadTemplate(key: string): Promise<LoadedTemplate> {
  try {
    const dbTemplate = await prisma.emailTemplate.findUnique({ where: { key } });
    if (dbTemplate) {
      return {
        senderName: dbTemplate.senderName,
        senderEmail: dbTemplate.senderEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.body
      };
    }
  } catch (err) {
    logger.warn('Failed to load email template from DB, using default', { key, error: String(err) });
  }

  const def = DEFAULT_TEMPLATES.find(d => d.key === key);
  if (def) {
    return {
      senderName: def.senderName,
      senderEmail: def.senderEmail,
      subject: def.subject,
      body: def.body
    };
  }

  return { senderName: fromName, senderEmail: fromEmail, subject: '', body: '' };
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName) => vars[varName] ?? '');
}

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
    if (!prefs) return true;
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
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return [];
  const recipients: string[] = [];
  for (const email of adminEmails) {
    try {
      const prefs = await prisma.notificationPreference.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!prefs) { recipients.push(email); continue; }
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
async function sendEmail(to: string | string[], subject: string, html: string, senderName?: string, senderEmail?: string, cc?: string | string[]): Promise<void> {
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) return;

  const name = senderName || fromName;
  const email = senderEmail || fromEmail;

  const ccRecipients = cc ? (Array.isArray(cc) ? cc : [cc]).filter(Boolean) : [];

  try {
    const resend = getResend();
    if (!resend) {
      logger.warn('Resend not configured - email would be sent', { to: recipients, cc: ccRecipients, subject });
      return;
    }

    const payload: Parameters<typeof resend.emails.send>[0] = {
      from: `${name} <${email}>`,
      to: recipients,
      subject,
      html
    };
    if (ccRecipients.length > 0) {
      payload.cc = ccRecipients;
    }

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      logger.error('Failed to send email', { to: recipients, cc: ccRecipients, subject, error });
      throw error;
    }

    logger.info('Email sent', { to: recipients, cc: ccRecipients, subject, id: data?.id });
  } catch (error) {
    logger.error('Email send failed', { to: recipients, cc: ccRecipients, subject, error: String(error) });
    throw error;
  }
}

// ─── PASSWORD RESET ────────────────────────────────────────────────────
export async function sendPasswordResetEmail(email: string, resetToken: string, cc?: string[]): Promise<void> {
  const allowed = await shouldSendToUser(email, 'password_reset');
  if (!allowed) {
    logger.info('Password reset email suppressed by preference', { email });
    return;
  }

  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const tpl = await loadTemplate('passwordReset');
  const vars = { resetUrl };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
}

// ─── PORTAL REGISTRATION (user) ───────────────────────────────────────
export async function sendRegistrationEmail(email: string, displayName: string, cc?: string[]): Promise<void> {
  const allowed = await shouldSendToUser(email, 'portal_registration');
  if (!allowed) return;

  const tpl = await loadTemplate('portalRegistration');
  const vars = { displayName: displayName || 'there', loginUrl: `${frontendUrl}/login` };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
}

// ─── PORTAL REGISTRATION (admin) ──────────────────────────────────────
export async function sendAdminRegistrationNotification(userEmail: string, displayName: string): Promise<void> {
  const recipients = await getAdminRecipientsFor('admin_registration');
  if (recipients.length === 0) return;

  const tpl = await loadTemplate('adminRegistration');
  const vars = {
    displayName: displayName || 'N/A',
    userEmail,
    time: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    adminUrl: `${frontendUrl}/admin/projects`
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(recipients, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail);
}

// ─── REGISTRATION INVITE (admin-triggered) ──────────────────────────────
export async function sendRegistrationInviteEmail(email: string, displayName: string, cc?: string[]): Promise<void> {
  const tpl = await loadTemplate('registrationInvite');
  const vars = {
    displayName: displayName || 'there',
    email,
    loginUrl: `${frontendUrl}/login`
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
}

// ─── ADMIN-TRIGGERED PASSWORD RESET ─────────────────────────────────────
export async function sendAdminPasswordResetEmail(email: string, resetToken: string, displayName: string, cc?: string[]): Promise<void> {
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const tpl = await loadTemplate('adminPasswordReset');
  const vars = { displayName: displayName || 'there', resetUrl };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
}

// ─── DOCUMENT SUBMISSION (user) ────────────────────────────────────────
export async function sendDocumentSubmissionEmail(
  email: string,
  displayName: string,
  projectName: string,
  categoryLabel: string,
  documentName: string,
  filename: string,
  cc?: string[]
): Promise<void> {
  const allowed = await shouldSendToUser(email, 'document_submission');
  if (!allowed) return;

  const tpl = await loadTemplate('documentSubmission');
  const vars = {
    displayName: displayName || 'there',
    projectName,
    categoryLabel,
    documentName,
    filename,
    portalUrl: frontendUrl
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
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

  const tpl = await loadTemplate('adminDocumentSubmission');
  const vars = {
    displayName: displayName || userEmail,
    userEmail,
    projectName,
    categoryLabel,
    documentName,
    filename,
    time: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    adminUrl: `${frontendUrl}/admin/projects/${projectId}`
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(recipients, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail);
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
  projects: WeeklyProjectSummary[],
  cc?: string[]
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

  const projectRowsHtml = `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f8f9fa;">
        <th style="padding: 10px 12px; text-align: left; font-size: 13px;">Project</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Total</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Accepted</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Pending</th>
        <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Action</th>
      </tr>
      ${projects.map(p => `
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
      `).join('')}
    </table>`;

  const tpl = await loadTemplate('weeklyUpdate');
  const vars = {
    displayName: displayName || 'there',
    projectRows: projectRowsHtml,
    portalUrl: frontendUrl
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(email, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail, cc);
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

  const tpl = await loadTemplate('adminWeeklyUpdate');
  const vars = {
    totalProjects: String(summary.totalProjects),
    activeProjects: String(summary.activeProjects),
    totalPending: String(summary.totalPending),
    totalAccepted: String(summary.totalAccepted),
    newRegistrations: String(summary.newRegistrations),
    newUploads: String(summary.newUploads),
    adminUrl: `${frontendUrl}/admin`
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(recipients, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail);
}

// ─── UPLOAD DIGEST (admin) ─────────────────────────────────────────────
export interface UploadDigestProject {
  projectId: string;
  projectName: string;
  clientEmail: string;
  uploads: {
    filename: string;
    categoryLabel: string;
    status: string;
    uploadedAt: string;
  }[];
}

export async function sendAdminUploadDigestEmail(
  recipientEmail: string,
  frequency: 'Daily' | 'Weekly',
  projects: UploadDigestProject[]
): Promise<void> {
  const totalUploads = projects.reduce((sum, p) => sum + p.uploads.length, 0);
  if (totalUploads === 0) return;

  const statusBadge = (s: string) => {
    switch (s) {
      case 'accepted': return '<span class="status-badge status-accepted">Accepted</span>';
      case 'pending_review': return '<span class="status-badge status-pending">Pending Review</span>';
      case 'needs_resubmission': return '<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:600;background:#f8d7da;color:#721c24;">Needs Resubmission</span>';
      default: return `<span class="status-badge status-pending">${s.replace(/_/g, ' ')}</span>`;
    }
  };

  const projectSectionsHtml = projects.map(p => `
    <div style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: #f8f9fa; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
        <strong style="font-size: 15px;">${p.projectName}</strong>
        <span style="font-size: 13px; color: #666; margin-left: 8px;">${p.clientEmail}</span>
        <span style="font-size: 13px; color: #888; float: right;">${p.uploads.length} file(s)</span>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #fafafa;">
          <th style="padding: 8px 16px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">File</th>
          <th style="padding: 8px 16px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Category</th>
          <th style="padding: 8px 16px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Status</th>
          <th style="padding: 8px 16px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Uploaded</th>
        </tr>
        ${p.uploads.map(u => `
        <tr>
          <td style="padding: 10px 16px; border-top: 1px solid #f0f0f0; font-size: 14px;">${u.filename}</td>
          <td style="padding: 10px 16px; border-top: 1px solid #f0f0f0; font-size: 14px;">${u.categoryLabel}</td>
          <td style="padding: 10px 16px; border-top: 1px solid #f0f0f0; font-size: 14px;">${statusBadge(u.status)}</td>
          <td style="padding: 10px 16px; border-top: 1px solid #f0f0f0; font-size: 13px; color: #666;">${u.uploadedAt}</td>
        </tr>`).join('')}
      </table>
      <div style="padding: 8px 16px; border-top: 1px solid #e5e7eb; text-align: right;">
        <a href="${frontendUrl}/admin/projects/${p.projectId}" style="font-size: 13px; color: #1e3a5f; text-decoration: none;">View Project →</a>
      </div>
    </div>`).join('');

  const tpl = await loadTemplate('adminUploadDigest');
  const vars = {
    frequency,
    frequencyLower: frequency.toLowerCase(),
    uploadCount: String(totalUploads),
    projectCount: String(projects.length),
    periodLabel: frequency === 'Daily' ? '24 hours' : '7 days',
    projectSections: projectSectionsHtml,
    adminUrl: `${frontendUrl}/admin`
  };
  const subject = interpolate(tpl.subject, vars);
  const body = interpolate(tpl.body, vars);

  await sendEmail(recipientEmail, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail);
}

// ─── TEST EMAIL ────────────────────────────────────────────────────────
function buildSampleVars(): Record<string, string> {
  return {
    displayName: 'Jane Doe',
    resetUrl: `${frontendUrl}/reset-password?token=test-token`,
    loginUrl: `${frontendUrl}/login`,
    portalUrl: frontendUrl,
    adminUrl: `${frontendUrl}/admin`,
    userEmail: 'jane.doe@example.com',
    email: 'jane.doe@example.com',
    time: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    projectName: 'Doe 2025 Tax Return',
    categoryLabel: 'W-2s',
    documentName: 'John W2',
    filename: 'w2_2025.pdf',
    projectRows: '<p style="color:#666;font-style:italic;">[Weekly project summary table would appear here]</p>',
    totalProjects: '12',
    activeProjects: '8',
    totalPending: '5',
    totalAccepted: '23',
    newRegistrations: '3',
    newUploads: '7',
    frequency: 'Weekly',
    frequencyLower: 'weekly',
    uploadCount: '5',
    projectCount: '2',
    periodLabel: '7 days',
    projectSections: '<p style="color:#666;font-style:italic;">[Upload digest project sections would appear here]</p>'
  };
}

export async function sendTestEmailForTemplate(
  templateKey: string,
  recipientEmail: string
): Promise<void> {
  const tpl = await loadTemplate(templateKey);
  if (!tpl.subject && !tpl.body) {
    throw new Error(`Template "${templateKey}" not found`);
  }

  const sampleVars = buildSampleVars();
  const subject = interpolate(`[TEST] ${tpl.subject}`, sampleVars);
  const body = interpolate(tpl.body, sampleVars);

  await sendEmail(recipientEmail, subject, wrapHtml(body), tpl.senderName, tpl.senderEmail);
}
