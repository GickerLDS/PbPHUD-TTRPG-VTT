import express from 'express';
import { z } from 'zod';
import { userPublicId } from '../auth.js';
import { query } from '../db.js';
import { validate } from '../validation.js';

export const adminRouter = express.Router();

const roleSchema = z.object({
  communityRole: z.enum(['admin', 'moderator', 'community_member'])
});

const demoAssignmentSchema = z.object({
  campaignId: z.number().int().positive().nullable(),
  mapId: z.number().int().positive().nullable(),
  threadId: z.number().int().positive().nullable()
});

const DEMO_ASSIGNMENT_KEY = 'demo_assignment';

adminRouter.get('/demo-assignment', async (_req, res, next) => {
  try {
    res.json({ demoAssignment: await loadDemoAssignment() });
  } catch (error) {
    next(error);
  }
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

adminRouter.get('/demo-assignment/options', async (req, res, next) => {
  try {
    const viewerUserId = userPublicId(req.user);
    const [campaignRows, mapRows, threadRows] = await Promise.all([
      query(
        `SELECT id, name
         FROM campaigns
         WHERE owner_user_id = ?
         ORDER BY name, id`,
        [viewerUserId]
      ),
      query(
        `SELECT maps.id, maps.campaign_id AS campaignId, maps.map_name AS mapName, maps.visibility_level AS visibilityLevel
         FROM maps
         INNER JOIN campaigns ON campaigns.id = maps.campaign_id
         WHERE campaigns.owner_user_id = ?
           AND maps.campaign_id IS NOT NULL
         ORDER BY maps.map_name, maps.id`,
        [viewerUserId]
      ),
      query(
        `SELECT campaign_forum_threads.id, campaign_forum_threads.campaign_id AS campaignId, campaign_forum_threads.map_id AS mapId, campaign_forum_threads.title, campaign_forum_threads.visibility_level AS visibilityLevel
         FROM campaign_forum_threads
         INNER JOIN campaigns ON campaigns.id = campaign_forum_threads.campaign_id
         WHERE campaigns.owner_user_id = ?
         ORDER BY campaign_forum_threads.title, campaign_forum_threads.id`,
        [viewerUserId]
      )
    ]);

    res.json({
      demoAssignment: await loadDemoAssignment(),
      campaigns: campaignRows.map((row) => ({
        id: Number(row.id),
        name: row.name
      })),
      maps: mapRows.map((row) => ({
        id: Number(row.id),
        campaignId: Number(row.campaignId),
        name: row.mapName,
        visibilityLevel: row.visibilityLevel
      })),
      threads: threadRows.map((row) => ({
        id: Number(row.id),
        campaignId: Number(row.campaignId),
        mapId: row.mapId ? Number(row.mapId) : null,
        title: row.title,
        visibilityLevel: row.visibilityLevel
      }))
    });
  } catch (error) {
    next(error);
  }
});

async function saveDemoAssignmentRoute(req, res, next) {
  try {
    const body = validate(demoAssignmentSchema, req.body);
    const viewerUserId = userPublicId(req.user);
    if (!body.campaignId && (body.mapId || body.threadId)) {
      res.status(400).json({ error: 'Choose a campaign before choosing a map or forum thread.' });
      return;
    }

    if (body.campaignId) {
      const campaignRows = await query(
        `SELECT id
         FROM campaigns
         WHERE id = ?
           AND owner_user_id = ?
         LIMIT 1`,
        [body.campaignId, viewerUserId]
      );
      if (!campaignRows.length) {
        res.status(400).json({ error: 'Demo campaign must be one of your campaigns.' });
        return;
      }
    }

    if (body.mapId) {
      const mapRows = await query(
        `SELECT maps.id
         FROM maps
         INNER JOIN campaigns ON campaigns.id = maps.campaign_id
         WHERE maps.id = ?
           AND maps.campaign_id = ?
           AND campaigns.owner_user_id = ?
         LIMIT 1`,
        [body.mapId, body.campaignId, viewerUserId]
      );
      if (!mapRows.length) {
        res.status(400).json({ error: 'Demo map must belong to one of your campaigns.' });
        return;
      }
    }

    if (body.threadId) {
      const threadRows = await query(
        `SELECT campaign_forum_threads.id, campaign_forum_threads.map_id AS mapId
         FROM campaign_forum_threads
         INNER JOIN campaigns ON campaigns.id = campaign_forum_threads.campaign_id
         WHERE campaign_forum_threads.id = ?
           AND campaign_forum_threads.campaign_id = ?
           AND campaigns.owner_user_id = ?
         LIMIT 1`,
        [body.threadId, body.campaignId, viewerUserId]
      );
      const thread = threadRows[0];
      if (!thread) {
        res.status(400).json({ error: 'Demo forum thread must belong to one of your campaigns.' });
        return;
      }
      if (body.mapId && Number(thread.mapId) !== Number(body.mapId)) {
        res.status(400).json({ error: 'Demo forum thread must be assigned to the selected map.' });
        return;
      }
    }

    await saveDemoAssignment(body);
    res.json({ demoAssignment: await loadDemoAssignment() });
  } catch (error) {
    next(error);
  }
}

adminRouter.patch('/demo-assignment', saveDemoAssignmentRoute);
adminRouter.post('/demo-assignment', saveDemoAssignmentRoute);

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

async function loadDemoAssignment() {
  const rows = await query(
    `SELECT setting_json AS settingJson FROM site_settings WHERE setting_key = ? LIMIT 1`,
    [DEMO_ASSIGNMENT_KEY]
  );
  const assignment = parseDemoAssignment(rows[0]?.settingJson);
  if (!assignment.campaignId) return assignment;

  const detailRows = await query(
    `SELECT
       campaign.name AS campaignName,
       maps.map_name AS mapName,
       thread.title AS threadTitle
     FROM campaigns campaign
     LEFT JOIN maps ON maps.id = ? AND maps.campaign_id = campaign.id
     LEFT JOIN campaign_forum_threads thread ON thread.id = ? AND thread.campaign_id = campaign.id
     WHERE campaign.id = ?
     LIMIT 1`,
    [assignment.mapId, assignment.threadId, assignment.campaignId]
  );
  const details = detailRows[0] || {};
  return {
    ...assignment,
    campaignName: details.campaignName || '',
    mapName: details.mapName || '',
    threadTitle: details.threadTitle || ''
  };
}

async function saveDemoAssignment(assignment) {
  await query(
    `INSERT INTO site_settings (setting_key, setting_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json)`,
    [DEMO_ASSIGNMENT_KEY, JSON.stringify(assignment)]
  );
}

function parseDemoAssignment(settingJson) {
  try {
    const parsed = settingJson ? JSON.parse(settingJson) : {};
    return {
      campaignId: parsed.campaignId ? Number(parsed.campaignId) : null,
      mapId: parsed.mapId ? Number(parsed.mapId) : null,
      threadId: parsed.threadId ? Number(parsed.threadId) : null,
      campaignName: '',
      mapName: '',
      threadTitle: ''
    };
  } catch (_error) {
    return {
      campaignId: null,
      mapId: null,
      threadId: null,
      campaignName: '',
      mapName: '',
      threadTitle: ''
    };
  }
}

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
