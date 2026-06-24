import express from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { validate } from '../validation.js';

export const adminRouter = express.Router();

const roleSchema = z.object({
  communityRole: z.enum(['admin', 'moderator', 'community_member'])
});

adminRouter.use((req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  if (req.user.community_role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
});

adminRouter.get('/users', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT
         users.id,
         CONCAT('user:', users.id) AS userId,
         users.email,
         users.display_name AS displayName,
         users.community_role AS communityRole,
         users.created_at AS createdAt,
         users.updated_at AS updatedAt,
         COUNT(DISTINCT public_posts.id) + COUNT(DISTINCT campaign_posts.id) AS postsMade
       FROM users
       LEFT JOIN public_forum_posts public_posts ON public_posts.author_user_id = CONCAT('user:', users.id)
       LEFT JOIN campaign_forum_posts campaign_posts ON campaign_posts.author_user_id = CONCAT('user:', users.id)
       GROUP BY users.id, users.email, users.display_name, users.community_role, users.created_at, users.updated_at
       ORDER BY users.display_name, users.email`
    );

    res.json({
      users: rows.map((row) => ({
        id: Number(row.id),
        userId: row.userId,
        email: row.email,
        displayName: row.displayName,
        communityRole: row.communityRole || 'community_member',
        postsMade: Number(row.postsMade || 0),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/users/:userId/role', async (req, res, next) => {
  try {
    const body = validate(roleSchema, req.body);
    const targetUserId = req.params.userId;
    const targetRows = await query(
      `SELECT id, community_role AS communityRole FROM users WHERE CONCAT('user:', id) = ? LIMIT 1`,
      [targetUserId]
    );
    const target = targetRows[0];
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.communityRole === 'admin' && body.communityRole !== 'admin') {
      const adminRows = await query(
        `SELECT COUNT(*) AS adminCount FROM users WHERE community_role = 'admin'`
      );
      if (Number(adminRows[0]?.adminCount || 0) <= 1) {
        res.status(400).json({ error: 'At least one admin must remain.' });
        return;
      }
    }

    await query(`UPDATE users SET community_role = ? WHERE id = ?`, [body.communityRole, target.id]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
