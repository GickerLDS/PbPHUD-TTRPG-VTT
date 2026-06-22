import express from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { validate } from '../validation.js';

export const campaignsRouter = express.Router();

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160)
});

const inviteSchema = z.object({
  userId: z.string().trim().min(1).max(191)
});

const campaignMapSchema = z.object({
  mapName: z.string().trim().min(1).max(120).regex(/^[\w -]+$/),
  gridWidth: z.number().int().min(5).max(99).default(40),
  gridHeight: z.number().int().min(5).max(99).default(40)
});

const forumThreadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20000),
  mapId: z.number().int().positive().nullable().optional()
});

const forumPostSchema = z.object({
  body: z.string().trim().min(1).max(20000)
});

const forumThreadMapSchema = z.object({
  mapId: z.number().int().positive().nullable()
});

campaignsRouter.use((req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
});

campaignsRouter.get('/', async (req, res, next) => {
  try {
    const viewerUserId = userPublicId(req.user);
    const rows = await query(
      `SELECT
         campaigns.id,
         campaigns.name,
         campaigns.owner_user_id AS ownerUserId,
         member.user_id AS memberUserId,
         COUNT(DISTINCT maps.id) AS mapCount
       FROM campaigns
       LEFT JOIN campaign_members member
         ON member.campaign_id = campaigns.id
        AND member.user_id = ?
       LEFT JOIN maps ON maps.campaign_id = campaigns.id
       WHERE campaigns.owner_user_id = ?
          OR member.user_id IS NOT NULL
       GROUP BY campaigns.id, campaigns.name, campaigns.owner_user_id, member.user_id
       ORDER BY campaigns.updated_at DESC, campaigns.name`,
      [viewerUserId, viewerUserId]
    );

    const campaigns = await Promise.all(rows.map(async (row) => ({
      id: Number(row.id),
      name: row.name,
      ownerUserId: row.ownerUserId,
      role: row.ownerUserId === viewerUserId ? 'owner' : 'member',
      mapCount: Number(row.mapCount),
      members: row.ownerUserId === viewerUserId ? await loadCampaignMembers(row.id) : [],
      maps: await loadCampaignMaps(row.id, viewerUserId, row.ownerUserId === viewerUserId)
    })));

    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(campaignSchema, req.body);
    const viewerUserId = userPublicId(req.user);
    const result = await query(
      `INSERT INTO campaigns (name, owner_user_id) VALUES (?, ?)`,
      [body.name, viewerUserId]
    );
    res.status(201).json({
      campaign: {
        id: Number(result.insertId),
        name: body.name,
        ownerUserId: viewerUserId,
        role: 'owner',
        mapCount: 0,
        members: [],
        maps: []
      }
    });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/members', async (req, res, next) => {
  try {
    const body = validate(inviteSchema, req.body);
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    if (body.userId !== campaign.owner_user_id) {
      await query(
        `INSERT INTO campaign_members (campaign_id, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [campaign.id, body.userId]
      );
    }
    res.json({ members: await loadCampaignMembers(campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/maps', async (req, res, next) => {
  try {
    const body = validate(campaignMapSchema, req.body);
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const groupName = `campaign-${campaign.id}`;
    const result = await query(
      `INSERT INTO maps (
         campaign_id, group_name, map_name, grid_size, grid_width, grid_height,
         owner_user_id, player_visible, legacy_map_data, legacy_map_data2
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, '', '')`,
      [
        campaign.id,
        groupName,
        body.mapName,
        Math.max(body.gridWidth, body.gridHeight),
        body.gridWidth,
        body.gridHeight,
        campaign.owner_user_id
      ]
    );

    res.status(201).json({
      map: {
        id: Number(result.insertId),
        campaignId: Number(campaign.id),
        name: body.mapName,
        playerVisible: false
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    next(error);
  }
});

campaignsRouter.get('/:campaignId/forum/threads', async (req, res, next) => {
  try {
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const mapId = req.query.mapId ? Number.parseInt(req.query.mapId, 10) : null;
    if (req.query.mapId && !Number.isFinite(mapId)) {
      res.status(400).json({ error: 'Invalid map id' });
      return;
    }

    const rows = await query(
      `SELECT
         thread.id,
         thread.title,
         thread.map_id AS mapId,
         thread.created_by_user_id AS createdByUserId,
         creator.display_name AS createdByDisplayName,
         thread.created_at AS createdAt,
         thread.updated_at AS updatedAt,
         maps.map_name AS mapName,
         COUNT(post.id) AS postCount,
         MAX(post.created_at) AS latestPostAt
       FROM campaign_forum_threads thread
       LEFT JOIN maps ON maps.id = thread.map_id
       LEFT JOIN users creator
         ON thread.created_by_user_id = CONCAT('user:', creator.id)
       LEFT JOIN campaign_forum_posts post ON post.thread_id = thread.id
       WHERE thread.campaign_id = ?
         AND (? IS NULL OR thread.map_id = ?)
       GROUP BY
         thread.id,
         thread.title,
         thread.map_id,
         thread.created_by_user_id,
         creator.display_name,
         thread.created_at,
         thread.updated_at,
         maps.map_name
       ORDER BY COALESCE(MAX(post.created_at), thread.updated_at) DESC, thread.created_at DESC`,
      [campaign.id, mapId, mapId]
    );

    res.json({ threads: rows.map(formatThreadSummary) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads', async (req, res, next) => {
  try {
    const body = validate(forumThreadSchema, req.body);
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (body.mapId) {
      const map = await loadCampaignMap(campaign.id, body.mapId);
      if (!map) {
        res.status(400).json({ error: 'Map must belong to this campaign' });
        return;
      }
    }

    const viewerUserId = userPublicId(req.user);
    const result = await transaction(async (connection) => {
      const threadResult = await connection.query(
        `INSERT INTO campaign_forum_threads (campaign_id, map_id, title, created_by_user_id)
         VALUES (?, ?, ?, ?)`,
        [campaign.id, body.mapId || null, body.title, viewerUserId]
      );
      await connection.query(
        `INSERT INTO campaign_forum_posts (thread_id, author_user_id, body_bbcode)
         VALUES (?, ?, ?)`,
        [threadResult.insertId, viewerUserId, body.body]
      );
      return threadResult;
    });

    const thread = await loadForumThread(result.insertId, campaign.id);
    res.status(201).json({ thread });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get('/:campaignId/forum/threads/:threadId', async (req, res, next) => {
  try {
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    res.json({ thread });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads/:threadId/posts', async (req, res, next) => {
  try {
    const body = validate(forumPostSchema, req.body);
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(
      `INSERT INTO campaign_forum_posts (thread_id, author_user_id, body_bbcode)
       VALUES (?, ?, ?)`,
      [thread.id, userPublicId(req.user), body.body]
    );

    res.status(201).json({ thread: await loadForumThread(thread.id, campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.patch('/:campaignId/forum/threads/:threadId/map', async (req, res, next) => {
  try {
    const body = validate(forumThreadMapSchema, req.body);
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    if (body.mapId) {
      const map = await loadCampaignMap(campaign.id, body.mapId);
      if (!map) {
        res.status(400).json({ error: 'Map must belong to this campaign' });
        return;
      }
    }

    await query(
      `UPDATE campaign_forum_threads SET map_id = ? WHERE id = ? AND campaign_id = ?`,
      [body.mapId, thread.id, campaign.id]
    );

    res.json({ thread: await loadForumThread(thread.id, campaign.id) });
  } catch (error) {
    next(error);
  }
});

async function loadOwnedCampaign(campaignId, user) {
  const rows = await query(
    `SELECT * FROM campaigns WHERE id = ? AND owner_user_id = ? LIMIT 1`,
    [campaignId, userPublicId(user)]
  );
  return rows[0] ?? null;
}

async function loadAccessibleCampaign(campaignId, user) {
  const viewerUserId = userPublicId(user);
  const rows = await query(
    `SELECT campaigns.*
     FROM campaigns
     LEFT JOIN campaign_members member
       ON member.campaign_id = campaigns.id
      AND member.user_id = ?
     WHERE campaigns.id = ?
       AND (campaigns.owner_user_id = ? OR member.user_id IS NOT NULL)
     LIMIT 1`,
    [viewerUserId, campaignId, viewerUserId]
  );
  return rows[0] ?? null;
}

async function loadCampaignMembers(campaignId) {
  const rows = await query(
    `SELECT user_id AS userId FROM campaign_members WHERE campaign_id = ? ORDER BY user_id`,
    [campaignId]
  );
  return rows.map((row) => row.userId);
}

async function loadCampaignMap(campaignId, mapId) {
  const rows = await query(
    `SELECT id, map_name AS mapName FROM maps WHERE campaign_id = ? AND id = ? LIMIT 1`,
    [campaignId, mapId]
  );
  return rows[0] ?? null;
}

async function loadCampaignMaps(campaignId, viewerUserId, isOwner) {
  const rows = await query(
    `SELECT
       maps.id,
       maps.map_name AS mapName,
       maps.player_visible AS playerVisible,
       map_invite.user_id AS mapInviteUserId
     FROM maps
     LEFT JOIN map_campaign_invites map_invite
       ON map_invite.map_id = maps.id
      AND map_invite.user_id = ?
     WHERE maps.campaign_id = ?
       AND (
         ? = TRUE
         OR maps.player_visible = TRUE
         OR map_invite.user_id IS NOT NULL
       )
     ORDER BY maps.map_name`,
    [viewerUserId, campaignId, isOwner]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.mapName,
    playerVisible: Boolean(row.playerVisible),
    invited: Boolean(row.mapInviteUserId)
  }));
}

async function loadForumThread(threadId, campaignId) {
  const threadRows = await query(
    `SELECT
       thread.id,
       thread.title,
       thread.map_id AS mapId,
       thread.created_by_user_id AS createdByUserId,
       creator.display_name AS createdByDisplayName,
       thread.created_at AS createdAt,
       thread.updated_at AS updatedAt,
       maps.map_name AS mapName
     FROM campaign_forum_threads thread
     LEFT JOIN maps ON maps.id = thread.map_id
     LEFT JOIN users creator
       ON thread.created_by_user_id = CONCAT('user:', creator.id)
     WHERE thread.id = ? AND thread.campaign_id = ?
     LIMIT 1`,
    [threadId, campaignId]
  );
  const thread = threadRows[0];
  if (!thread) return null;

  const postRows = await query(
     `SELECT
       campaign_forum_posts.id,
       campaign_forum_posts.author_user_id AS authorUserId,
       author.display_name AS authorDisplayName,
       campaign_forum_posts.body_bbcode AS body,
       campaign_forum_posts.created_at AS createdAt,
       campaign_forum_posts.updated_at AS updatedAt
     FROM campaign_forum_posts
     LEFT JOIN users author
       ON campaign_forum_posts.author_user_id = CONCAT('user:', author.id)
     WHERE thread_id = ?
     ORDER BY campaign_forum_posts.created_at, campaign_forum_posts.id`,
    [thread.id]
  );

  return {
    ...formatThreadSummary({ ...thread, postCount: postRows.length, latestPostAt: postRows.at(-1)?.createdAt || thread.updatedAt }),
    posts: postRows.map((post) => ({
      id: Number(post.id),
      authorUserId: post.authorUserId,
      authorDisplayName: post.authorDisplayName || post.authorUserId,
      body: post.body,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    }))
  };
}

function formatThreadSummary(row) {
  return {
    id: Number(row.id),
    title: row.title,
    mapId: row.mapId ? Number(row.mapId) : null,
    mapName: row.mapName || '',
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName || row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    postCount: Number(row.postCount || 0),
    latestPostAt: row.latestPostAt || row.updatedAt
  };
}

function userPublicId(user) {
  return `user:${user.id}`;
}
