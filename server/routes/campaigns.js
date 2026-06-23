import crypto from 'node:crypto';
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

const castSchema = z.object({
  castType: z.enum(['player', 'npc', 'monster']),
  ownerUserId: z.string().trim().max(191).optional(),
  name: z.string().trim().min(1).max(160),
  portraitUrl: z.string().trim().max(900000).optional().default(''),
  publicDescription: z.string().trim().max(12000).optional().default(''),
  gmNotes: z.string().trim().max(12000).optional().default(''),
  visibleToPlayers: z.boolean().optional().default(true)
});

const castUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  portraitUrl: z.string().trim().max(900000).optional(),
  publicDescription: z.string().trim().max(12000).optional(),
  gmNotes: z.string().trim().max(12000).optional(),
  visibleToPlayers: z.boolean().optional()
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

const forumPostEditSchema = z.object({
  body: z.string().trim().min(1).max(20000)
});

const forumThreadMapSchema = z.object({
  mapId: z.number().int().positive().nullable()
});

campaignsRouter.get('/:campaignId/cast/:castId/portrait', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT portrait_url AS portraitUrl
       FROM campaign_cast
       WHERE campaign_id = ? AND id = ?
       LIMIT 1`,
      [req.params.campaignId, req.params.castId]
    );
    const portraitUrl = rows[0]?.portraitUrl || '';
    if (!portraitUrl) {
      res.status(404).end();
      return;
    }

    if (/^https?:\/\//i.test(portraitUrl)) {
      res.redirect(portraitUrl);
      return;
    }

    const dataImage = parseDataImage(portraitUrl);
    if (!dataImage) {
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', dataImage.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(dataImage.buffer);
  } catch (error) {
    next(error);
  }
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
    await ensureCampaignPlayerCastEntries(campaign.id, campaign.owner_user_id);
    res.json({ members: await loadCampaignMembers(campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get('/:campaignId/cast', async (req, res, next) => {
  try {
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    await ensureCampaignPlayerCastEntries(campaign.id, campaign.owner_user_id);
    const cast = await loadCampaignCast(campaign.id, viewerUserId, campaign.owner_user_id === viewerUserId);
    res.json({ cast });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/cast', async (req, res, next) => {
  try {
    const body = validate(castSchema, req.body);
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    if (body.castType === 'player') {
      res.status(400).json({ error: 'Player cast entries are created from campaign members' });
      return;
    }

    const portraitUrl = normalizePortraitUrl(body.portraitUrl);
    const result = await query(
      `INSERT INTO campaign_cast (
         campaign_id, cast_type, owner_user_id, name, portrait_url,
         public_description, gm_notes, visible_to_players
       )
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        campaign.id,
        body.castType,
        body.name,
        portraitUrl,
        body.publicDescription,
        body.gmNotes,
        body.visibleToPlayers
      ]
    );

    await ensureCampaignPlayerCastEntries(campaign.id, campaign.owner_user_id);
    const viewerUserId = userPublicId(req.user);
    res.status(201).json({
      cast: await loadCampaignCast(campaign.id, viewerUserId, true),
      createdId: Number(result.insertId)
    });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.patch('/:campaignId/cast/:castId', async (req, res, next) => {
  try {
    const body = validate(castUpdateSchema, req.body);
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    await ensureCampaignPlayerCastEntries(campaign.id, campaign.owner_user_id);
    const castEntry = await loadCastEntry(campaign.id, req.params.castId);
    if (!castEntry) {
      res.status(404).json({ error: 'Cast member not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    const isOwner = campaign.owner_user_id === viewerUserId;
    const isOwnPlayerEntry = castEntry.cast_type === 'player' && castEntry.owner_user_id === viewerUserId;
    if (!isOwner && !isOwnPlayerEntry) {
      res.status(403).json({ error: 'You can only edit your own cast entry' });
      return;
    }

    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.portraitUrl !== undefined) patch.portrait_url = normalizePortraitUrl(body.portraitUrl);
    if (body.publicDescription !== undefined) patch.public_description = body.publicDescription;
    if (body.gmNotes !== undefined) patch.gm_notes = body.gmNotes;
    if (isOwner && castEntry.cast_type !== 'player' && body.visibleToPlayers !== undefined) {
      patch.visible_to_players = body.visibleToPlayers;
    }
    if (castEntry.cast_type === 'player') {
      patch.visible_to_players = true;
    }

    const entries = Object.entries(patch);
    if (entries.length) {
      await query(
        `UPDATE campaign_cast
         SET ${entries.map(([key]) => `${key} = ?`).join(', ')}
         WHERE id = ? AND campaign_id = ?`,
        [...entries.map(([, value]) => value), castEntry.id, campaign.id]
      );
    }

    res.json({ cast: await loadCampaignCast(campaign.id, viewerUserId, isOwner) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.delete('/:campaignId/cast/:castId', async (req, res, next) => {
  try {
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const castEntry = await loadCastEntry(campaign.id, req.params.castId);
    if (!castEntry) {
      res.status(404).json({ error: 'Cast member not found' });
      return;
    }
    if (castEntry.cast_type === 'player') {
      res.status(400).json({ error: 'Player cast entries are managed from campaign membership' });
      return;
    }

    await query(`DELETE FROM campaign_cast WHERE id = ? AND campaign_id = ?`, [castEntry.id, campaign.id]);
    const viewerUserId = userPublicId(req.user);
    res.json({ cast: await loadCampaignCast(campaign.id, viewerUserId, true) });
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

campaignsRouter.get('/:campaignId/forum/post-identities', async (req, res, next) => {
  try {
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    const identities = await loadPostIdentities(campaign.id, viewerUserId, campaign.owner_user_id === viewerUserId);
    res.json({ identities });
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
    const normalizedBody = await normalizeForumBodyCharacters(campaign.id, viewerUserId, campaign.owner_user_id === viewerUserId, body.body);
    const result = await transaction(async (connection) => {
      const threadResult = await connection.query(
        `INSERT INTO campaign_forum_threads (campaign_id, map_id, title, created_by_user_id)
         VALUES (?, ?, ?, ?)`,
        [campaign.id, body.mapId || null, body.title, viewerUserId]
      );
      await insertForumPost(connection, threadResult.insertId, viewerUserId, normalizedBody);
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

    const viewerUserId = userPublicId(req.user);
    const normalizedBody = await normalizeForumBodyCharacters(campaign.id, viewerUserId, campaign.owner_user_id === viewerUserId, body.body);
    await transaction(async (connection) => {
      await insertForumPost(connection, thread.id, viewerUserId, normalizedBody);
    });

    res.status(201).json({ thread: await loadForumThread(thread.id, campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.patch('/:campaignId/forum/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    const body = validate(forumPostEditSchema, req.body);
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const post = await loadThreadPost(req.params.threadId, req.params.postId, campaign.id);
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }
    if (post.author_user_id !== userPublicId(req.user)) {
      res.status(403).json({ error: 'Only the poster can edit this post' });
      return;
    }
    if (post.deleted_at) {
      res.status(400).json({ error: 'Deleted posts cannot be edited' });
      return;
    }

    const normalizedBody = await normalizeForumBodyCharacters(
      campaign.id,
      userPublicId(req.user),
      campaign.owner_user_id === userPublicId(req.user),
      body.body
    );

    await query(
      `UPDATE campaign_forum_posts
       SET body_bbcode = ?, edited_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedBody, post.id]
    );

    res.json({ thread: await loadForumThread(req.params.threadId, campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.delete('/:campaignId/forum/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    const campaign = await loadAccessibleCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const post = await loadThreadPost(req.params.threadId, req.params.postId, campaign.id);
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    if (post.author_user_id !== viewerUserId && campaign.owner_user_id !== viewerUserId) {
      res.status(403).json({ error: 'Only the poster or campaign owner can delete this post' });
      return;
    }

    await query(
      `UPDATE campaign_forum_posts
       SET body_bbcode = '', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), edited_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [post.id]
    );

    res.json({ thread: await loadForumThread(req.params.threadId, campaign.id) });
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

async function ensureCampaignPlayerCastEntries(campaignId, ownerUserId) {
  const memberRows = await query(
    `SELECT user_id AS userId FROM campaign_members WHERE campaign_id = ?`,
    [campaignId]
  );
  const playerUserIds = [...new Set([ownerUserId, ...memberRows.map((row) => row.userId)].filter(Boolean))];
  if (!playerUserIds.length) return;

  const existingRows = await query(
    `SELECT owner_user_id AS ownerUserId
     FROM campaign_cast
     WHERE campaign_id = ? AND cast_type = 'player' AND owner_user_id IN (${playerUserIds.map(() => '?').join(',')})`,
    [campaignId, ...playerUserIds]
  );
  const existing = new Set(existingRows.map((row) => row.ownerUserId));
  const missing = playerUserIds.filter((userId) => !existing.has(userId));
  if (!missing.length) return;

  const userRows = await query(
    `SELECT CONCAT('user:', id) AS userId, display_name AS displayName
     FROM users
     WHERE CONCAT('user:', id) IN (${missing.map(() => '?').join(',')})`,
    missing
  );
  const displayNames = new Map(userRows.map((row) => [row.userId, row.displayName]));

  for (const userId of missing) {
    await query(
      `INSERT INTO campaign_cast (
         campaign_id, cast_type, owner_user_id, name, portrait_url,
         public_description, gm_notes, visible_to_players
       )
       VALUES (?, 'player', ?, ?, '', '', '', TRUE)`,
      [campaignId, userId, displayNames.get(userId) || userId]
    );
  }
}

async function loadCampaignCast(campaignId, viewerUserId, isOwner) {
  const rows = await query(
    `SELECT
       id,
       cast_type AS castType,
       owner_user_id AS ownerUserId,
       name,
       portrait_url AS portraitUrl,
       public_description AS publicDescription,
       gm_notes AS gmNotes,
       visible_to_players AS visibleToPlayers,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM campaign_cast
     WHERE campaign_id = ?
       AND (? = TRUE OR cast_type = 'player' OR visible_to_players = TRUE OR owner_user_id = ?)
     ORDER BY
       CASE cast_type WHEN 'player' THEN 1 WHEN 'npc' THEN 2 ELSE 3 END,
       name`,
    [campaignId, isOwner, viewerUserId]
  );

  return rows.map((row) => {
    const canEdit = isOwner || (row.castType === 'player' && row.ownerUserId === viewerUserId);
    const canSeeGmNotes = isOwner || row.ownerUserId === viewerUserId;
    return {
      id: Number(row.id),
      castType: row.castType,
      ownerUserId: row.ownerUserId || '',
      name: row.name,
      portraitUrl: row.portraitUrl || '',
      publicDescription: row.publicDescription || '',
      gmNotes: canSeeGmNotes ? row.gmNotes || '' : '',
      visibleToPlayers: Boolean(row.visibleToPlayers),
      canEdit,
      canDelete: isOwner && row.castType !== 'player',
      canManageVisibility: isOwner && row.castType !== 'player',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });
}

async function loadCastEntry(campaignId, castId) {
  const rows = await query(
    `SELECT *
     FROM campaign_cast
     WHERE campaign_id = ? AND id = ?
     LIMIT 1`,
    [campaignId, castId]
  );
  return rows[0] ?? null;
}

function normalizePortraitUrl(value) {
  const portraitUrl = String(value || '').trim();
  if (!portraitUrl) return '';
  if (/^https?:\/\/[^\s]+$/i.test(portraitUrl)) return portraitUrl;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(portraitUrl)) return portraitUrl;
  const error = new Error('Portrait must be an http(s) image link or uploaded image data');
  error.status = 400;
  throw error;
}

function parseDataImage(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

function castPortraitPath(campaignId, castId) {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/cast/${encodeURIComponent(castId)}/portrait`;
}

async function loadCampaignMap(campaignId, mapId) {
  const rows = await query(
    `SELECT id, map_name AS mapName FROM maps WHERE campaign_id = ? AND id = ? LIMIT 1`,
    [campaignId, mapId]
  );
  return rows[0] ?? null;
}

async function normalizeForumBodyCharacters(campaignId, viewerUserId, isOwner, body) {
  const text = String(body || '');
  if (!/\[character\s+/i.test(text)) return text;

  const identities = await loadPostIdentities(campaignId, viewerUserId, isOwner);
  const identitiesById = new Map(identities.map((identity) => [identity.id, identity]));

  return text.replace(/\[character\s+([^\]]+)\]/gi, (_match, attrText) => {
    const attrs = parseBbcodeAttributes(attrText);
    const identity = identitiesById.get(attrs.id || '');
    if (!identity) {
      const error = new Error('Character/NPC BBCode includes an identity that is not available to this user');
      error.status = 403;
      throw error;
    }
    const normalizedAttrs = [
      ['id', identity.id],
      ['type', identity.type],
      ['name', identity.name],
      ['subtitle', identity.subtitle],
      ['image', identity.image || '']
    ]
      .map(([name, value]) => `${name}=${encodeBbcodeAttribute(value)}`)
      .join(' ');
    return `[character ${normalizedAttrs}]`;
  });
}

function parseBbcodeAttributes(attrText) {
  const attrs = {};
  for (const match of String(attrText || '').matchAll(/([a-z]+)=([^\s\]]*)/gi)) {
    attrs[match[1].toLowerCase()] = decodeBbcodeAttribute(match[2]);
  }
  return attrs;
}

function encodeBbcodeAttribute(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeBbcodeAttribute(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
}

async function loadPostIdentities(campaignId, viewerUserId, isOwner) {
  await ensureCampaignPlayerCastEntries(campaignId, await loadCampaignOwnerUserId(campaignId));
  const castRows = await query(
    `SELECT
       id,
       cast_type AS castType,
       owner_user_id AS ownerUserId,
       name,
       portrait_url AS portraitUrl,
       visible_to_players AS visibleToPlayers
     FROM campaign_cast
     WHERE campaign_id = ?
       AND (? = TRUE OR (cast_type = 'player' AND owner_user_id = ?))`,
    [campaignId, isOwner, viewerUserId]
  );

  const identities = new Map();
  for (const row of castRows) {
    const type = row.castType === 'player' ? 'character' : 'npc';
    identities.set(`cast:${row.id}`, {
      id: `cast:${row.id}`,
      type,
      name: row.name,
      image: row.portraitUrl ? castPortraitPath(campaignId, row.id) : '',
      subtitle: `${castTypeLabel(row.castType)} from The Cast`,
      source: {
        type: 'campaign-cast',
        castId: Number(row.id)
      }
    });
  }

  const rows = await query(
    `SELECT
       maps.id AS mapId,
       maps.map_name AS mapName,
       map_editor_state.entities_json AS entitiesJson
     FROM maps
     LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
     WHERE maps.campaign_id = ?
     ORDER BY maps.map_name`,
    [campaignId]
  );

  for (const row of rows) {
    const entities = parseJson(row.entitiesJson, []);
    const playerEntities = entities.filter((entity) => entity.type === 'player');
    for (const entity of entities) {
      if (!canUseEntityAsPostIdentity(entity, playerEntities, viewerUserId, isOwner)) continue;
      const id = `entity:${entity.id}`;
      if (identities.has(id)) continue;
      identities.set(id, {
        id,
        type: entity.type === 'mob' ? 'npc' : 'character',
        name: entity.name,
        image: entity.image || '',
        subtitle: `${entityTypeLabel(entity.type)} from ${row.mapName}`,
        source: {
          type: 'map-entity',
          mapId: Number(row.mapId),
          entityId: entity.id
        }
      });
    }
  }

  return [...identities.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadCampaignOwnerUserId(campaignId) {
  const rows = await query(`SELECT owner_user_id AS ownerUserId FROM campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  return rows[0]?.ownerUserId || '';
}

function castTypeLabel(type) {
  if (type === 'monster') return 'Monster';
  if (type === 'npc') return 'NPC';
  return 'Character';
}

function canUseEntityAsPostIdentity(entity, playerEntities, viewerUserId, isOwner) {
  if (!entity?.id || !entity?.name) return false;
  if (isOwner) return true;
  if (entity.type === 'player' && entity.ownerId === viewerUserId) return true;
  if (entity.type !== 'charmie' || !entity.ownerId) return false;
  const owner = playerEntities.find((player) => player.id === entity.ownerId);
  return owner?.ownerId === viewerUserId;
}

function entityTypeLabel(type) {
  if (type === 'mob') return 'NPC/Monster';
  if (type === 'charmie') return 'Companion';
  return 'Character';
}

async function loadThreadPost(threadId, postId, campaignId) {
  const rows = await query(
    `SELECT campaign_forum_posts.*
     FROM campaign_forum_posts
     INNER JOIN campaign_forum_threads thread ON thread.id = campaign_forum_posts.thread_id
     WHERE campaign_forum_posts.id = ?
       AND campaign_forum_posts.thread_id = ?
       AND thread.campaign_id = ?
     LIMIT 1`,
    [postId, threadId, campaignId]
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

async function insertForumPost(connection, threadId, authorUserId, body) {
  const postResult = await connection.query(
    `INSERT INTO campaign_forum_posts (thread_id, author_user_id, body_bbcode)
     VALUES (?, ?, ?)`,
    [threadId, authorUserId, body]
  );
  const rolls = resolveDiceRolls(body);
  for (const [index, roll] of rolls.entries()) {
    await connection.query(
      `INSERT INTO campaign_forum_post_rolls (post_id, roll_index, roll_type, command_text, result_json)
       VALUES (?, ?, ?, ?, ?)`,
      [postResult.insertId, index + 1, roll.rollType, roll.commandText, JSON.stringify(roll.result)]
    );
  }
  return postResult;
}

function resolveDiceRolls(body) {
  const rolls = [];
  const text = String(body || '');

  for (const match of text.matchAll(/(^|\s)\/roll\s+(\d{1,3})d(\d{1,3})(?:\s*([+-])\s*(\d{1,4}))?/gi)) {
    if (rolls.length >= 20) break;
    const diceCount = clampInteger(match[2], 1, 100);
    const dieSize = clampInteger(match[3], 2, 1000);
    const modifier = match[5] ? clampInteger(match[5], 0, 10000) * (match[4] === '-' ? -1 : 1) : 0;
    const dice = Array.from({ length: diceCount }, () => crypto.randomInt(1, dieSize + 1));
    const subtotal = dice.reduce((sum, value) => sum + value, 0);
    rolls.push({
      rollType: 'standard',
      commandText: match[0].trim(),
      result: {
        diceCount,
        dieSize,
        modifier,
        dice,
        subtotal,
        total: subtotal + modifier
      }
    });
  }

  for (const match of text.matchAll(/(^|\s)\/(?:sr|shadowrun)\s+(\d{1,3})(?:\s+(edge))?/gi)) {
    if (rolls.length >= 20) break;
    const diceCount = clampInteger(match[2], 1, 100);
    const useEdge = Boolean(match[3]);
    const dice = Array.from({ length: diceCount }, () => crypto.randomInt(1, 7));
    const edgeDice = [];
    if (useEdge) {
      let exploding = dice.filter((value) => value === 6).length;
      while (exploding > 0 && dice.length + edgeDice.length < 300) {
        exploding -= 1;
        const next = crypto.randomInt(1, 7);
        edgeDice.push(next);
        if (next === 6) exploding += 1;
      }
    }
    const allDice = [...dice, ...edgeDice];
    const hits = allDice.filter((value) => value >= 5).length;
    const ones = allDice.filter((value) => value === 1).length;
    const glitch = ones > allDice.length / 2;
    rolls.push({
      rollType: 'shadowrun',
      commandText: match[0].trim(),
      result: {
        diceCount,
        useEdge,
        dice,
        edgeDice,
        allDice,
        hits,
        fives: allDice.filter((value) => value === 5).length,
        sixes: allDice.filter((value) => value === 6).length,
        ones,
        glitch,
        criticalGlitch: glitch && hits === 0
      }
    });
  }

  return rolls.sort((a, b) => text.indexOf(a.commandText) - text.indexOf(b.commandText));
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
       campaign_forum_posts.deleted_at AS deletedAt,
       campaign_forum_posts.edited_at AS editedAt,
       campaign_forum_posts.created_at AS createdAt,
       campaign_forum_posts.updated_at AS updatedAt
     FROM campaign_forum_posts
     LEFT JOIN users author
       ON campaign_forum_posts.author_user_id = CONCAT('user:', author.id)
     WHERE thread_id = ?
     ORDER BY campaign_forum_posts.created_at, campaign_forum_posts.id`,
    [thread.id]
  );

  const rollRows = postRows.length ? await query(
    `SELECT
       id,
       post_id AS postId,
       roll_index AS rollIndex,
       roll_type AS rollType,
       command_text AS commandText,
       result_json AS resultJson,
       created_at AS createdAt
     FROM campaign_forum_post_rolls
     WHERE post_id IN (${postRows.map(() => '?').join(',')})
     ORDER BY post_id, roll_index`,
    postRows.map((post) => post.id)
  ) : [];
  const rollsByPostId = rollRows.reduce((rollsByPost, roll) => {
    const postId = Number(roll.postId);
    if (!rollsByPost.has(postId)) rollsByPost.set(postId, []);
    rollsByPost.get(postId).push({
      id: Number(roll.id),
      rollIndex: Number(roll.rollIndex),
      rollType: roll.rollType,
      commandText: roll.commandText,
      result: JSON.parse(roll.resultJson),
      createdAt: roll.createdAt
    });
    return rollsByPost;
  }, new Map());

  return {
    ...formatThreadSummary({ ...thread, postCount: postRows.length, latestPostAt: postRows.at(-1)?.createdAt || thread.updatedAt }),
    posts: postRows.map((post) => ({
      id: Number(post.id),
      authorUserId: post.authorUserId,
      authorDisplayName: post.authorDisplayName || post.authorUserId,
      body: post.body,
      deleted: Boolean(post.deletedAt),
      deletedAt: post.deletedAt,
      editedAt: post.editedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      rolls: rollsByPostId.get(Number(post.id)) || []
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
