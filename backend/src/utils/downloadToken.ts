import jwt from 'jsonwebtoken';

/**
 * Short-lived, single-file download tokens.
 *
 * File downloads are reached by a browser navigation, which carries no
 * Authorization header, so the streaming route cannot sit behind the usual
 * middleware. This grants access to exactly one file for one minute — the
 * session JWT must never be put in a URL, where it would land in browser
 * history, server logs and referrer headers.
 */
const TTL_SECONDS = 60;
const PURPOSE = 'file-download';

export function signDownloadToken(fileId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ fileId, purpose: PURPOSE }, secret, { expiresIn: TTL_SECONDS });
}

export function verifyDownloadToken(token: string): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || !token) return null;
  try {
    const decoded = jwt.verify(token, secret) as { fileId?: string; purpose?: string };
    return decoded.purpose === PURPOSE && decoded.fileId ? decoded.fileId : null;
  } catch {
    return null;
  }
}
