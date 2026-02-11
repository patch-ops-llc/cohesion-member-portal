import { Resend } from 'resend';
import { logger } from '../utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';
const fromName = process.env.FROM_NAME || 'Cohesion Portal';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const html = `
    <p>You requested a password reset for your Cohesion Portal account.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;

  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('Resend API key not configured - password reset link (dev only):', { resetUrl });
      return;
    }

    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: 'Reset your password - Cohesion Portal',
      html
    });

    if (error) {
      logger.error('Failed to send password reset email', { email, error });
      throw error;
    }

    logger.info('Password reset email sent', { email, id: data?.id });
  } catch (error) {
    logger.error('Failed to send password reset email', { email, error: String(error) });
    throw error;
  }
}
