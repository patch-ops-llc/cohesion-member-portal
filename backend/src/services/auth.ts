import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import prisma from '../db/client';
import { sendMagicLinkEmail } from './email';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'dev-magic-secret';
const SESSION_EXPIRY_DAYS = parseInt(process.env.SESSION_EXPIRY_DAYS || '7');
const MAGIC_LINK_EXPIRY_MINUTES = parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES || '15');

export interface TokenPayload {
  userId: string;
  email: string;
  type: 'client' | 'admin';
}

// Generate a secure magic link token
function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create and send magic link
export async function createMagicLink(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Generate token
  const token = generateMagicToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  // Delete any existing unused magic links for this email
  await prisma.magicLink.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null
    }
  });

  // Create new magic link
  await prisma.magicLink.create({
    data: {
      email: normalizedEmail,
      token,
      expiresAt
    }
  });

  // Send email
  await sendMagicLinkEmail(normalizedEmail, token);
  
  logger.info('Magic link created', { email: normalizedEmail });
}

// Verify magic link token and create session
export async function verifyMagicLink(token: string): Promise<{
  jwt: string;
  user: { id: string; email: string };
}> {
  // Find the magic link
  const magicLink = await prisma.magicLink.findUnique({
    where: { token }
  });

  if (!magicLink) {
    throw new Error('Invalid or expired link');
  }

  if (magicLink.usedAt) {
    throw new Error('This link has already been used');
  }

  if (magicLink.expiresAt < new Date()) {
    throw new Error('This link has expired');
  }

  // Mark magic link as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() }
  });

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { email: magicLink.email }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: magicLink.email
      }
    });
    logger.info('Created new user', { userId: user.id, email: user.email });
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  // Create session
  const sessionToken = uuidv4();
  const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt: sessionExpiresAt
    }
  });

  // Generate JWT
  const jwtToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      type: 'client'
    } as TokenPayload,
    JWT_SECRET,
    { expiresIn: `${SESSION_EXPIRY_DAYS}d` }
  );

  logger.info('Magic link verified, session created', { userId: user.id });

  return {
    jwt: jwtToken,
    user: {
      id: user.id,
      email: user.email
    }
  };
}

// Verify JWT token
export function verifyJwt(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Invalidate session (logout)
export async function invalidateSession(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId }
  });
  logger.info('Sessions invalidated', { userId });
}

// Clean up expired magic links and sessions
export async function cleanupExpired(): Promise<void> {
  const now = new Date();
  
  const deletedLinks = await prisma.magicLink.deleteMany({
    where: { expiresAt: { lt: now } }
  });

  const deletedSessions = await prisma.session.deleteMany({
    where: { expiresAt: { lt: now } }
  });

  logger.info('Cleaned up expired records', {
    magicLinks: deletedLinks.count,
    sessions: deletedSessions.count
  });
}

// Verify admin API key
export function verifyAdminApiKey(apiKey: string): boolean {
  const validKey = process.env.ADMIN_API_KEY;
  if (!validKey) {
    logger.warn('ADMIN_API_KEY not configured');
    return false;
  }
  return apiKey === validKey;
}
