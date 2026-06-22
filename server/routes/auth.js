import express from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../env.js';
import {
  authTokenFromRequest,
  createEmailVerification,
  createSession,
  deleteSession,
  hashPassword,
  publicUser,
  sendVerificationEmail,
  tokenHash,
  verifyPassword,
  verifyRecaptcha
} from '../auth.js';
import { validate } from '../validation.js';

export const authRouter = express.Router();

const email = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const password = z.string().min(8).max(200);

const registerSchema = z.object({
  email,
  displayName: z.string().trim().min(1).max(120),
  password,
  recaptchaToken: z.string().max(4000).optional()
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200)
});

const resendVerificationSchema = z.object({
  email
});

const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200)
});

authRouter.get('/config', (_req, res) => {
  res.json({
    recaptchaSiteKey: config.auth.recaptchaSiteKey,
    recaptchaType: config.auth.recaptchaType,
    recaptchaMinScore: config.auth.recaptchaMinScore,
    recaptchaAction: config.auth.recaptchaAction,
    requireRecaptcha: config.auth.requireRecaptcha
  });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = validate(registerSchema, req.body);
    const recaptchaOk = await verifyRecaptcha(body.recaptchaToken, req.ip);
    if (!recaptchaOk) {
      res.status(400).json({ error: 'reCAPTCHA verification failed' });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const result = await query(
      `INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?)`,
      [body.email, body.displayName, passwordHash]
    );
    const user = {
      id: Number(result.insertId),
      email: body.email,
      display_name: body.displayName,
      email_verified_at: null
    };
    const verification = await createEmailVerification(user.id);
    try {
      await sendVerificationEmail(user, verification.token);
    } catch (emailError) {
      console.error('Verification email failed', emailError);
      if (process.env.NODE_ENV === 'production') throw emailError;
    }

    res.status(201).json({
      user: publicUser(user),
      message: 'Registration created. Check your email to verify your account.'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    if (error.status === 409) error.message = 'An account with that email already exists';
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = validate(loginSchema, req.body);
    const rows = await query(
      `SELECT id, email, display_name, password_hash, email_verified_at FROM users WHERE email = ? LIMIT 1`,
      [body.email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if (!user.email_verified_at) {
      res.status(403).json({ error: 'Verify your email before signing in' });
      return;
    }

    const session = await createSession(user.id);
    res.json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/resend-verification', async (req, res, next) => {
  try {
    const body = validate(resendVerificationSchema, req.body);
    const message = 'If that account is registered and unverified, a verification email has been sent.';
    const rows = await query(
      `SELECT id, email, display_name, email_verified_at FROM users WHERE email = ? LIMIT 1`,
      [body.email]
    );
    const user = rows[0];

    if (user && !user.email_verified_at) {
      const verification = await createEmailVerification(user.id);
      try {
        await sendVerificationEmail(user, verification.token);
      } catch (emailError) {
        console.error('Verification email resend failed', emailError);
      }
    }

    res.json({ message });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await deleteSession(authTokenFromRequest(req));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const body = validate(verifyEmailSchema, req.body);
    const hash = tokenHash(body.token);
    const result = await transaction(async (connection) => {
      const rows = await connection.query(
        `SELECT
           email_verification_tokens.id,
           email_verification_tokens.user_id,
           users.email,
           users.display_name,
           users.email_verified_at
         FROM email_verification_tokens
         INNER JOIN users ON users.id = email_verification_tokens.user_id
         WHERE email_verification_tokens.token_hash = ?
           AND email_verification_tokens.used_at IS NULL
           AND email_verification_tokens.expires_at > CURRENT_TIMESTAMP
         LIMIT 1
         FOR UPDATE`,
        [hash]
      );
      const row = rows[0];
      if (!row) return null;

      await connection.query(
        `UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [row.id]
      );
      await connection.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?`,
        [row.user_id]
      );
      return {
        id: row.user_id,
        email: row.email,
        display_name: row.display_name,
        email_verified_at: row.email_verified_at || new Date()
      };
    });

    if (!result) {
      res.status(400).json({ error: 'Verification link is invalid or expired' });
      return;
    }

    const session = await createSession(result.id);
    res.json({ user: publicUser(result), token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
    next(error);
  }
});
