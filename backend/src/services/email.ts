import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLinkUrl = `${frontendUrl}/auth/verify/${token}`;
  
  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'Cohesion Portal'}" <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
    to: email,
    subject: 'Your Login Link - Cohesion Document Portal',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0f1b5e; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { 
              display: inline-block; 
              padding: 15px 30px; 
              background: #f39c12; 
              color: white !important; 
              text-decoration: none; 
              border-radius: 5px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Cohesion Document Portal</h1>
            </div>
            <div class="content">
              <h2>Your Login Link</h2>
              <p>Click the button below to securely log in to your document portal:</p>
              <p style="text-align: center;">
                <a href="${magicLinkUrl}" class="button">Log In to Portal</a>
              </p>
              <p><strong>This link will expire in 15 minutes.</strong></p>
              <p>If you didn't request this login link, you can safely ignore this email.</p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Or copy and paste this link into your browser:<br>
                <a href="${magicLinkUrl}">${magicLinkUrl}</a>
              </p>
            </div>
            <div class="footer">
              <p>This is an automated message from Cohesion Document Portal.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Your Login Link - Cohesion Document Portal

Click the link below to securely log in to your document portal:
${magicLinkUrl}

This link will expire in 15 minutes.

If you didn't request this login link, you can safely ignore this email.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Magic link email sent', { email });
  } catch (error) {
    logger.error('Failed to send magic link email', { email, error: String(error) });
    throw new Error('Failed to send email');
  }
}

// Verify email transport configuration
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    await transporter.verify();
    logger.info('Email transport verified');
    return true;
  } catch (error) {
    logger.error('Email transport verification failed', { error: String(error) });
    return false;
  }
}
