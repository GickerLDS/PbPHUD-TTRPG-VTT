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
  userPublicId,
  verifyPassword,
  verifyRecaptcha
} from '../auth.js';
import { subscribeUserToAccessibleForumThreads } from '../forumSubscriptions.js';
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

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  profileAbout: z.string().trim().max(4000).optional().default(''),
  profilePronouns: z.string().trim().max(80).optional().default(''),
  profileTimezone: z.string().trim().max(80).optional().default(''),
  profileImageUrl: z.string().trim().max(900000).optional().default(''),
  useGravatar: z.boolean().optional().default(false),
  autoSubscribeForumThreads: z.boolean().optional().default(false)
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

authRouter.get('/me', async (req, res, next) => {
  try {
    res.json({ user: req.user ? publicUser(await withAccountStats(req.user)) : null });
  } catch (error) {
    next(error);
  }
});

authRouter.patch('/profile', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const body = validate(profileSchema, req.body);
    await query(
      `UPDATE users
       SET
         display_name = ?,
         profile_about = ?,
         profile_pronouns = ?,
         profile_timezone = ?,
         profile_image_url = ?,
         use_gravatar = ?,
         auto_subscribe_forum_threads = ?
       WHERE id = ?`,
      [
        body.displayName,
        body.profileAbout,
        body.profilePronouns,
        body.profileTimezone,
        body.profileImageUrl,
        body.useGravatar,
        body.autoSubscribeForumThreads,
        req.user.id
      ]
    );

    const rows = await query(
      `SELECT
         id,
         email,
         display_name,
         profile_about,
         profile_pronouns,
         profile_timezone,
         profile_image_url,
         use_gravatar,
         auto_subscribe_forum_threads,
         community_role,
         email_verified_at,
         updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );
    const user = rows[0];
    if (body.autoSubscribeForumThreads) {
      await subscribeUserToAccessibleForumThreads(userPublicId(user));
    }

    res.json({ user: publicUser(await withAccountStats(user)) });
  } catch (error) {
    next(error);
  }
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
      community_role: 'community_member',
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
      `SELECT
         id,
         email,
         display_name,
         password_hash,
         profile_about,
         profile_pronouns,
         profile_timezone,
         profile_image_url,
         use_gravatar,
         auto_subscribe_forum_threads,
         community_role,
         email_verified_at,
         updated_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
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
    res.json({ user: publicUser(await withAccountStats(user)), token: session.token, expiresAt: session.expiresAt });
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
    res.json({ user: publicUser(await withAccountStats(result)), token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
    next(error);
  }
});

async function withAccountStats(user) {
  if (!user?.id) return user;
  const userId = userPublicId(user);
  const [
    postRows,
    threadRows,
    rollRows,
    ownedRows,
    memberRows,
    subscriptionRows
  ] = await Promise.all([
    query(
      `SELECT SUM(count) AS count
       FROM (
         SELECT COUNT(*) AS count FROM campaign_forum_posts WHERE author_user_id = ?
         UNION ALL
         SELECT COUNT(*) AS count FROM public_forum_posts WHERE author_user_id = ?
       ) counts`,
      [userId, userId]
    ),
    query(
      `SELECT SUM(count) AS count
       FROM (
         SELECT COUNT(*) AS count FROM campaign_forum_threads WHERE created_by_user_id = ?
         UNION ALL
         SELECT COUNT(*) AS count FROM public_forum_threads WHERE created_by_user_id = ?
       ) counts`,
      [userId, userId]
    ),
    query(
      `SELECT COUNT(rolls.id) AS count
       FROM campaign_forum_post_rolls rolls
       INNER JOIN campaign_forum_posts posts ON posts.id = rolls.post_id
       WHERE posts.author_user_id = ?`,
      [userId]
    ),
    query(`SELECT COUNT(*) AS count FROM campaigns WHERE owner_user_id = ?`, [userId]),
    query(`SELECT COUNT(*) AS count FROM campaign_members WHERE user_id = ?`, [userId]),
    query(`SELECT COUNT(*) AS count FROM campaign_forum_thread_subscriptions WHERE user_id = ?`, [userId])
  ]);

  return {
    ...user,
    stats: {
      postsMade: Number(postRows[0]?.count || 0),
      threadsStarted: Number(threadRows[0]?.count || 0),
      diceRollsMade: Number(rollRows[0]?.count || 0),
      campaignsOwned: Number(ownedRows[0]?.count || 0),
      campaignsJoined: Number(memberRows[0]?.count || 0),
      subscribedThreads: Number(subscriptionRows[0]?.count || 0)
    }
  };
}
