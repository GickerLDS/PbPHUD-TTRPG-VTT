import crypto from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
import { query } from './db.js';
import { config } from './env.js';

const scrypt = promisify(crypto.scrypt);
const PASSWORD_KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, key] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !key) return false;

  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(key, 'hex');
  return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
}

export function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function userPublicId(user) {
  return `user:${user.id}`;
}

export async function createSession(userId) {
  const token = createToken();
  const expiresAt = dateHoursFromNow(config.auth.sessionDays * 24);
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash(token), expiresAt]
  );
  return { token, expiresAt };
}

export async function loadUserFromToken(token) {
  if (!token) return null;
  const rows = await query(
    `SELECT
       users.id,
       users.email,
       users.display_name,
       users.email_verified_at
     FROM user_sessions
     INNER JOIN users ON users.id = user_sessions.user_id
     WHERE user_sessions.token_hash = ?
       AND user_sessions.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash(token)]
  );
  return rows[0] ?? null;
}

export async function deleteSession(token) {
  if (!token) return;
  await query(`DELETE FROM user_sessions WHERE token_hash = ?`, [tokenHash(token)]);
}

export async function createEmailVerification(userId) {
  const token = createToken();
  const expiresAt = dateHoursFromNow(config.auth.emailVerificationHours);
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash(token), expiresAt]
  );
  return { token, expiresAt };
}

export async function sendVerificationEmail(user, token) {
  const verifyUrl = `${config.clientOrigin}/?verifyEmailToken=${encodeURIComponent(token)}`;
  if (!config.email.smtp.auth.user || !config.email.smtp.auth.pass) {
    console.log(`Email verification link for ${user.email}: ${verifyUrl}`);
    return;
  }

  const transporter = nodemailer.createTransport(config.email.smtp);
  await transporter.sendMail({
    from: config.email.from,
    to: user.email,
    subject: 'Verify your PBPHud VTT account',
    text: `Welcome to PBPHud VTT.\n\nVerify your email address:\n${verifyUrl}\n\nThis link expires in ${config.auth.emailVerificationHours} hours.`,
    html: `
      <p>Welcome to PBPHud VTT.</p>
      <p><a href="${escapeHtml(verifyUrl)}">Verify your email address</a></p>
      <p>This link expires in ${config.auth.emailVerificationHours} hours.</p>
    `
  });
}

export async function verifyRecaptcha(token, remoteIp, expectedAction = config.auth.recaptchaAction) {
  if (!config.auth.requireRecaptcha) return true;
  if (!token) {
    console.warn('reCAPTCHA verification failed: missing token');
    return false;
  }
  if (!config.auth.recaptchaSecretKey) {
    console.warn('reCAPTCHA verification failed: missing secret key');
    return false;
  }

  const body = new URLSearchParams({
    secret: config.auth.recaptchaSecretKey,
    response: token
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!data.success) {
    console.warn('reCAPTCHA verification failed', {
      errorCodes: data['error-codes'] || []
    });
    return false;
  }

  if (config.auth.recaptchaType === 'v3') {
    const score = Number(data.score);
    const ok = (
      Number.isFinite(score) &&
      score >= config.auth.recaptchaMinScore &&
      data.action === expectedAction
    );
    if (!ok) {
      console.warn('reCAPTCHA v3 score check failed', {
        score: data.score,
        action: data.action,
        expectedAction,
        minScore: config.auth.recaptchaMinScore
      });
    }
    return ok;
  }

  return true;
}

export function publicUser(user) {
  return {
    id: userPublicId(user),
    email: user.email,
    displayName: user.display_name,
    emailVerified: Boolean(user.email_verified_at)
  };
}

export function authTokenFromRequest(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function attachUser(req, _res, next) {
  try {
    const token = authTokenFromRequest(req);
    req.authToken = token;
    req.user = await loadUserFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

function dateHoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
