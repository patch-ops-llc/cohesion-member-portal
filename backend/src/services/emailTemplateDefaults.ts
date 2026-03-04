const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const FROM_NAME = process.env.FROM_NAME || 'Cohesion Portal';

export interface TemplateDefault {
  key: string;
  label: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: TemplateDefault[] = [
  {
    key: 'passwordReset',
    label: 'Password Reset',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Reset your password - Cohesion Portal',
    body: `<p>Hi there,</p>
<p>You requested a password reset for your Cohesion Portal account.</p>
<p>Click the button below to set a new password:</p>
<p style="text-align: center;">
  <a href="{{resetUrl}}" class="btn">Reset Password</a>
</p>
<p style="font-size: 13px; color: #666;">
  Or copy this link: <a href="{{resetUrl}}" style="color: #1e3a5f;">{{resetUrl}}</a>
</p>
<p style="font-size: 13px; color: #999;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
    variables: ['resetUrl']
  },
  {
    key: 'portalRegistration',
    label: 'Registration Welcome',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Welcome to Cohesion Portal',
    body: `<p>Hi {{displayName}},</p>
<p>Welcome to the Cohesion Document Portal! Your account has been created successfully.</p>
<p>You can now log in to view your projects, upload documents, and track your tax return progress.</p>
<p style="text-align: center;">
  <a href="{{loginUrl}}" class="btn">Go to Portal</a>
</p>
<p style="font-size: 13px; color: #666;">If you didn't create this account, please contact our team.</p>`,
    variables: ['displayName', 'loginUrl']
  },
  {
    key: 'adminRegistration',
    label: 'Admin - New Registration',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'New Portal Registration - {{displayName}}',
    body: `<p>A new client has registered on the Cohesion Portal:</p>
<table>
  <tr><td class="detail-label">Name</td><td>{{displayName}}</td></tr>
  <tr><td class="detail-label">Email</td><td>{{userEmail}}</td></tr>
  <tr><td class="detail-label">Time</td><td>{{time}}</td></tr>
</table>
<p style="text-align: center; margin-top: 24px;">
  <a href="{{adminUrl}}" class="btn">View in Admin Portal</a>
</p>`,
    variables: ['displayName', 'userEmail', 'time', 'adminUrl']
  },
  {
    key: 'registrationInvite',
    label: 'Registration Invite',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: "You're Invited to the Cohesion Document Portal",
    body: `<p>Hi {{displayName}},</p>
<p>You've been invited to join the <strong>Cohesion Document Portal</strong>.</p>
<p>This portal allows you to securely upload and track your tax documents. Getting started takes less than a minute — just set a password and you're in.</p>
<p style="text-align: center;">
  <a href="{{loginUrl}}" class="btn">Set Up Your Account</a>
</p>
<p style="font-size: 13px; color: #666;">
  When you click the button, enter your email (<strong>{{email}}</strong>) and you'll be prompted to create a password.
</p>
<p style="font-size: 13px; color: #999;">If you've already registered, you can simply log in at the link above.</p>`,
    variables: ['displayName', 'email', 'loginUrl']
  },
  {
    key: 'adminPasswordReset',
    label: 'Admin-Triggered Password Reset',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Password Reset - Cohesion Portal',
    body: `<p>Hi {{displayName}},</p>
<p>A password reset has been initiated for your Cohesion Portal account by our team.</p>
<p>Click the button below to set a new password:</p>
<p style="text-align: center;">
  <a href="{{resetUrl}}" class="btn">Reset Password</a>
</p>
<p style="font-size: 13px; color: #666;">
  Or copy this link: <a href="{{resetUrl}}" style="color: #1e3a5f;">{{resetUrl}}</a>
</p>
<p style="font-size: 13px; color: #999;">This link expires in 1 hour. If you didn't expect this, you can safely ignore this email.</p>`,
    variables: ['displayName', 'resetUrl']
  },
  {
    key: 'documentSubmission',
    label: 'Document Submission Confirmation',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Document Submitted: {{documentName}} - {{projectName}}',
    body: `<p>Hi {{displayName}},</p>
<p>Your document has been submitted successfully!</p>
<table>
  <tr><td class="detail-label">Project</td><td>{{projectName}}</td></tr>
  <tr><td class="detail-label">Category</td><td>{{categoryLabel}}</td></tr>
  <tr><td class="detail-label">Document</td><td>{{documentName}}</td></tr>
  <tr><td class="detail-label">File</td><td>{{filename}}</td></tr>
  <tr><td class="detail-label">Status</td><td><span class="status-badge status-pending">Pending Review</span></td></tr>
</table>
<p>Our team will review your submission shortly. You'll be notified once it's processed.</p>
<p style="text-align: center;">
  <a href="{{portalUrl}}" class="btn">View Your Projects</a>
</p>`,
    variables: ['displayName', 'projectName', 'categoryLabel', 'documentName', 'filename', 'portalUrl']
  },
  {
    key: 'adminDocumentSubmission',
    label: 'Admin - Document Submitted',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Document Submitted by {{displayName}} - {{projectName}}',
    body: `<p>A client has submitted a document:</p>
<table>
  <tr><td class="detail-label">Client</td><td>{{displayName}}</td></tr>
  <tr><td class="detail-label">Project</td><td>{{projectName}}</td></tr>
  <tr><td class="detail-label">Category</td><td>{{categoryLabel}}</td></tr>
  <tr><td class="detail-label">Document</td><td>{{documentName}}</td></tr>
  <tr><td class="detail-label">File</td><td>{{filename}}</td></tr>
  <tr><td class="detail-label">Time</td><td>{{time}}</td></tr>
</table>
<p style="text-align: center; margin-top: 24px;">
  <a href="{{adminUrl}}" class="btn">Review in Admin</a>
</p>`,
    variables: ['displayName', 'userEmail', 'projectName', 'categoryLabel', 'documentName', 'filename', 'time', 'adminUrl']
  },
  {
    key: 'weeklyUpdate',
    label: 'Weekly Update (Client)',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Your Weekly Cohesion Portal Update',
    body: `<p>Hi {{displayName}},</p>
<p>Here's your weekly update on your Cohesion Document Portal projects:</p>
{{projectRows}}
<p style="text-align: center;">
  <a href="{{portalUrl}}" class="btn">View Your Projects</a>
</p>
<p style="font-size: 12px; color: #999;">You can manage your notification preferences in the portal settings.</p>`,
    variables: ['displayName', 'projectRows', 'portalUrl']
  },
  {
    key: 'adminWeeklyUpdate',
    label: 'Weekly Summary (Admin)',
    senderName: FROM_NAME,
    senderEmail: FROM_EMAIL,
    subject: 'Weekly Cohesion Portal Admin Summary',
    body: `<p>Here's your weekly Cohesion Portal admin summary:</p>
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  <tr style="background: #f8f9fa;"><td style="padding: 12px; font-weight: 600;">Total Projects</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">{{totalProjects}}</td></tr>
  <tr><td style="padding: 12px; font-weight: 600;">Active Projects</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">{{activeProjects}}</td></tr>
  <tr style="background: #f8f9fa;"><td style="padding: 12px; font-weight: 600;">Pending Review</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700; color: #856404;">{{totalPending}}</td></tr>
  <tr><td style="padding: 12px; font-weight: 600;">Accepted</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700; color: #155724;">{{totalAccepted}}</td></tr>
  <tr style="background: #f8f9fa;"><td style="padding: 12px; font-weight: 600;">New Registrations (7d)</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">{{newRegistrations}}</td></tr>
  <tr><td style="padding: 12px; font-weight: 600;">New Uploads (7d)</td><td style="padding: 12px; text-align: right; font-size: 20px; font-weight: 700;">{{newUploads}}</td></tr>
</table>
<p style="text-align: center;">
  <a href="{{adminUrl}}" class="btn">Open Admin Dashboard</a>
</p>`,
    variables: ['totalProjects', 'activeProjects', 'totalPending', 'totalAccepted', 'newRegistrations', 'newUploads', 'adminUrl']
  }
];
