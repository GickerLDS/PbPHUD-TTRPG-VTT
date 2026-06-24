import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import {
  enqueueForumThreadNotifications,
  sendForumThreadTestNotification
} from '../forumNotifications.js';
import {
  subscribeAutoSubscribersToForumThread,
  subscribeUserToCampaignThreadsIfEnabled
} from '../forumSubscriptions.js';
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

const mapVisibilityLevelSchema = z.enum(['public', 'campaign', 'hidden', 'demo']);

const forumThreadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20000),
  mapId: z.number().int().positive().nullable().optional(),
  visibilityLevel: z.enum(['demo', 'public', 'campaign', 'hidden']).optional().default('campaign')
});

const forumThreadVisibilitySchema = z.object({
  visibilityLevel: z.enum(['demo', 'public', 'campaign', 'hidden'])
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

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    if (/^https?:\/\//i.test(portraitUrl)) {
      res.redirect(cacheBustExternalPortraitUrl(portraitUrl, req.query.v || req.query.refresh || ''));
      return;
    }

    const dataImage = parseDataImage(portraitUrl);
    if (!dataImage) {
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', dataImage.mimeType);
    res.send(dataImage.buffer);
  } catch (error) {
    next(error);
  }
});

campaignsRouter.use((req, res, next) => {
  if (req.method === 'GET' && /^\/[^/]+\/forum\/threads(?:\/[^/]+)?$/.test(req.path)) {
    next();
    return;
  }
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
      unreadForumCount: await loadCampaignUnreadForumCount(row.id, viewerUserId, row.ownerUserId === viewerUserId),
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
    await subscribeUserToCampaignThreadsIfEnabled(campaign.id, body.userId);
    res.json({ members: await loadCampaignMembers(campaign.id) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get('/:campaignId/cast', async (req, res, next) => {
  try {
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
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
         owner_user_id, player_visible, visibility_level, legacy_map_data, legacy_map_data2
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'hidden', '', '')`,
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
        playerVisible: false,
        visibilityLevel: 'hidden'
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
         thread.visibility_level AS visibilityLevel,
         thread.map_id AS mapId,
         thread.created_by_user_id AS createdByUserId,
         creator.display_name AS createdByDisplayName,
         creator.email AS createdByEmail,
         creator.profile_image_url AS createdByProfileImageUrl,
         creator.use_gravatar AS createdByUseGravatar,
         creator.updated_at AS createdByUpdatedAt,
         creator_post_counts.postCount AS createdByPostCount,
         thread.created_at AS createdAt,
         thread.updated_at AS updatedAt,
         maps.map_name AS mapName,
         COUNT(post.id) AS postCount,
         MAX(post.created_at) AS latestPostAt,
         COUNT(
           CASE
             WHEN post.author_user_id <> ?
              AND (thread_read.last_read_post_id IS NULL OR post.id > thread_read.last_read_post_id)
             THEN 1
           END
         ) AS unreadCount
       FROM campaign_forum_threads thread
       LEFT JOIN maps ON maps.id = thread.map_id
       LEFT JOIN users creator
         ON thread.created_by_user_id = CONCAT('user:', creator.id)
       LEFT JOIN (
         SELECT author_user_id, COUNT(*) AS postCount
         FROM campaign_forum_posts
         GROUP BY author_user_id
       ) creator_post_counts ON creator_post_counts.author_user_id = thread.created_by_user_id
       LEFT JOIN campaign_forum_posts post ON post.thread_id = thread.id
       LEFT JOIN campaign_forum_thread_reads thread_read
         ON thread_read.thread_id = thread.id
        AND thread_read.user_id = ?
       WHERE thread.campaign_id = ?
         AND (? IS NULL OR thread.map_id = ?)
         AND (
           ? = TRUE
           OR thread.visibility_level IN ('demo', 'public')
           OR (? = TRUE AND thread.visibility_level = 'campaign')
         )
       GROUP BY
         thread.id,
         thread.title,
         thread.visibility_level,
         thread.map_id,
         thread.created_by_user_id,
         creator.display_name,
         creator.email,
         creator.profile_image_url,
         creator.use_gravatar,
         creator.updated_at,
         creator_post_counts.postCount,
         thread.created_at,
         thread.updated_at,
         maps.map_name
       ORDER BY COALESCE(MAX(post.created_at), thread.updated_at) DESC, thread.created_at DESC`,
      [access.viewerUserId, access.viewerUserId, campaign.id, mapId, mapId, access.isOwner, access.isMember]
    );

    res.json({ threads: rows.map((row) => formatThreadSummary(row, threadPermissions(row.visibilityLevel, access))) });
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
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
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
        `INSERT INTO campaign_forum_threads (campaign_id, map_id, title, visibility_level, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)`,
        [campaign.id, body.mapId || null, body.title, body.visibilityLevel, viewerUserId]
      );
      await insertForumPost(connection, threadResult.insertId, viewerUserId, normalizedBody);
      return threadResult;
    });

    await subscribeAutoSubscribersToForumThread(campaign.id, Number(result.insertId));
    const access = {
      campaign,
      viewerUserId,
      isOwner: campaign.owner_user_id === viewerUserId,
      isMember: true
    };
    const thread = await loadForumThread(result.insertId, campaign.id, viewerUserId, access);
    res.status(201).json({ thread });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get('/:campaignId/forum/threads/:threadId', async (req, res, next) => {
  try {
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id, access.viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    res.json({ thread });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads/:threadId/read', async (req, res, next) => {
  try {
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id, access.viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }
    if (!access.viewerUserId) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    await markThreadRead(thread.id, access.viewerUserId);
    res.json({ thread: await loadForumThread(thread.id, campaign.id, access.viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads/:threadId/subscription', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(
      `INSERT INTO campaign_forum_thread_subscriptions (thread_id, user_id, notify_pending)
       VALUES (?, ?, FALSE)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [thread.id, viewerUserId]
    );

    res.json({ thread: await loadForumThread(thread.id, campaign.id, viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.delete('/:campaignId/forum/threads/:threadId/subscription', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(
      `DELETE FROM campaign_forum_thread_subscriptions WHERE thread_id = ? AND user_id = ?`,
      [thread.id, viewerUserId]
    );

    res.json({ thread: await loadForumThread(thread.id, campaign.id, viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads/:threadId/test-notification', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    const email = await sendForumThreadTestNotification({
      campaignId: campaign.id,
      campaignName: campaign.name,
      threadTitle: thread.title,
      toEmail: req.user.email,
      displayName: req.user.display_name || req.user.email
    });

    res.json({ ok: email.sent, email });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/:campaignId/forum/threads/:threadId/posts', async (req, res, next) => {
  try {
    const body = validate(forumPostSchema, req.body);
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }
    if (!thread.permissions.canPost) {
      res.status(403).json({ error: 'You do not have permission to post in this thread' });
      return;
    }

    const normalizedBody = await normalizeForumBodyCharacters(campaign.id, viewerUserId, campaign.owner_user_id === viewerUserId, body.body);
    const postResult = await transaction(async (connection) => {
      return insertForumPost(connection, thread.id, viewerUserId, normalizedBody);
    });
    enqueueForumThreadNotifications(campaign.id, thread.id, viewerUserId, Number(postResult.insertId)).catch((error) => {
      console.warn('Forum subscription queueing failed', error);
    });

    res.status(201).json({ thread: await loadForumThread(thread.id, campaign.id, viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.patch('/:campaignId/forum/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    const body = validate(forumPostEditSchema, req.body);
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    const post = await loadThreadPost(req.params.threadId, req.params.postId, campaign.id);
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }
    if (post.author_user_id !== viewerUserId || !thread.permissions.canEditOwnPosts) {
      res.status(403).json({ error: 'Only the poster can edit this post' });
      return;
    }
    if (post.deleted_at) {
      res.status(400).json({ error: 'Deleted posts cannot be edited' });
      return;
    }

    const normalizedBody = await normalizeForumBodyCharacters(
      campaign.id,
      viewerUserId,
      campaign.owner_user_id === viewerUserId,
      body.body
    );

    await query(
      `UPDATE campaign_forum_posts
       SET body_bbcode = ?, edited_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedBody, post.id]
    );

    res.json({ thread: await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.delete('/:campaignId/forum/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const access = await loadCampaignForumAccess(req.params.campaignId, req.user);
    const campaign = access?.campaign;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const thread = await loadForumThread(req.params.threadId, campaign.id, access.viewerUserId, access);
    if (!thread || !thread.permissions.canView) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    const post = await loadThreadPost(req.params.threadId, req.params.postId, campaign.id);
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }

    const viewerUserId = access.viewerUserId;
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

    res.json({ thread: await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access) });
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

    const viewerUserId = userPublicId(req.user);
    const access = {
      campaign,
      viewerUserId,
      isOwner: true,
      isMember: true
    };
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
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

    res.json({ thread: await loadForumThread(thread.id, campaign.id, viewerUserId, access) });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.patch('/:campaignId/forum/threads/:threadId/visibility', async (req, res, next) => {
  try {
    const body = validate(forumThreadVisibilitySchema, req.body);
    const campaign = await loadOwnedCampaign(req.params.campaignId, req.user);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    const access = {
      campaign,
      viewerUserId,
      isOwner: true,
      isMember: true
    };
    const thread = await loadForumThread(req.params.threadId, campaign.id, viewerUserId, access);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(
      `UPDATE campaign_forum_threads SET visibility_level = ? WHERE id = ? AND campaign_id = ?`,
      [body.visibilityLevel, thread.id, campaign.id]
    );

    res.json({ thread: await loadForumThread(thread.id, campaign.id, viewerUserId, access) });
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

async function loadCampaignForumAccess(campaignId, user) {
  const viewerUserId = userPublicId(user);
  return loadCampaignForumAccessByViewerUserId(campaignId, viewerUserId);
}

async function loadCampaignForumAccessByViewerUserId(campaignId, viewerUserId = '') {
  const rows = await query(
    `SELECT
       campaigns.*,
       campaigns.owner_user_id AS ownerUserId,
       member.user_id AS memberUserId
     FROM campaigns
     LEFT JOIN campaign_members member
       ON member.campaign_id = campaigns.id
      AND member.user_id = ?
     WHERE campaigns.id = ?
     LIMIT 1`,
    [viewerUserId, campaignId]
  );
  const campaign = rows[0];
  if (!campaign) return null;
  const ownerUserId = campaign.owner_user_id ?? campaign.ownerUserId ?? '';
  const memberUserId = campaign.member_user_id ?? campaign.memberUserId ?? '';
  const isOwner = Boolean(viewerUserId && ownerUserId === viewerUserId);
  const isMember = Boolean(isOwner || memberUserId === viewerUserId);
  return { campaign, viewerUserId, isOwner, isMember };
}

async function loadCampaignMembers(campaignId) {
  const rows = await query(
    `SELECT user_id AS userId FROM campaign_members WHERE campaign_id = ? ORDER BY user_id`,
    [campaignId]
  );
  return rows.map((row) => row.userId);
}

async function loadCampaignUnreadForumCount(campaignId, viewerUserId, isOwner = false) {
  const rows = await query(
    `SELECT COUNT(post.id) AS unreadCount
     FROM campaign_forum_threads thread
     INNER JOIN campaign_forum_posts post ON post.thread_id = thread.id
     LEFT JOIN campaign_forum_thread_reads thread_read
       ON thread_read.thread_id = thread.id
      AND thread_read.user_id = ?
     WHERE thread.campaign_id = ?
       AND (? = TRUE OR thread.visibility_level <> 'hidden')
       AND post.author_user_id <> ?
       AND (thread_read.last_read_post_id IS NULL OR post.id > thread_read.last_read_post_id)`,
    [viewerUserId, campaignId, isOwner, viewerUserId]
  );
  return Number(rows[0]?.unreadCount || 0);
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

function castPortraitPath(campaignId, castId, version = '') {
  const versionSuffix = version ? `?v=${encodeURIComponent(new Date(version).getTime() || String(version))}` : '';
  return `/api/campaigns/${encodeURIComponent(campaignId)}/cast/${encodeURIComponent(castId)}/portrait${versionSuffix}`;
}

function cacheBustExternalPortraitUrl(url, version = '') {
  if (!version) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('_pbphud_v', String(version));
    return parsed.toString();
  } catch {
    return url;
  }
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
       visible_to_players AS visibleToPlayers,
       updated_at AS updatedAt
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
      image: row.portraitUrl ? castPortraitPath(campaignId, row.id, row.updatedAt) : '',
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

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
       maps.visibility_level AS visibilityLevel
     FROM maps
     WHERE maps.campaign_id = ?
       AND (
         ? = TRUE
         OR maps.visibility_level IN ('public', 'campaign', 'demo')
         OR (maps.visibility_level = 'hidden' AND maps.player_visible = TRUE)
       )
     ORDER BY maps.map_name`,
    [campaignId, isOwner]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.mapName,
    playerVisible: Boolean(row.playerVisible),
    visibilityLevel: normalizeMapVisibilityLevel(row)
  }));
}

function normalizeMapVisibilityLevel(row) {
  if (mapVisibilityLevelSchema.safeParse(row.visibilityLevel).success) return row.visibilityLevel;
  return row.playerVisible ? 'campaign' : 'hidden';
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

async function markThreadRead(threadId, viewerUserId) {
  const rows = await query(
    `SELECT id
     FROM campaign_forum_posts
     WHERE thread_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [threadId]
  );
  const lastPostId = rows[0]?.id ? Number(rows[0].id) : null;
  await query(
    `INSERT INTO campaign_forum_thread_reads (thread_id, user_id, last_read_post_id, read_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       last_read_post_id = VALUES(last_read_post_id),
       read_at = CURRENT_TIMESTAMP`,
    [threadId, viewerUserId, lastPostId]
  );
  await query(
    `UPDATE campaign_forum_thread_subscriptions
     SET notify_pending = FALSE
     WHERE thread_id = ? AND user_id = ?`,
    [threadId, viewerUserId]
  );
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

async function loadForumThread(threadId, campaignId, viewerUserId = '', access = null) {
  const effectiveAccess = access ?? await loadCampaignForumAccessByViewerUserId(campaignId, viewerUserId);
  const threadRows = await query(
    `SELECT
       thread.id,
       thread.title,
       thread.visibility_level AS visibilityLevel,
       thread.map_id AS mapId,
       thread.created_by_user_id AS createdByUserId,
       creator.display_name AS createdByDisplayName,
       creator.email AS createdByEmail,
       creator.profile_image_url AS createdByProfileImageUrl,
       creator.use_gravatar AS createdByUseGravatar,
       creator.updated_at AS createdByUpdatedAt,
       creator_post_counts.postCount AS createdByPostCount,
       thread.created_at AS createdAt,
       thread.updated_at AS updatedAt,
       maps.map_name AS mapName
     FROM campaign_forum_threads thread
     LEFT JOIN maps ON maps.id = thread.map_id
     LEFT JOIN users creator
       ON thread.created_by_user_id = CONCAT('user:', creator.id)
     LEFT JOIN (
       SELECT author_user_id, COUNT(*) AS postCount
       FROM campaign_forum_posts
       GROUP BY author_user_id
     ) creator_post_counts ON creator_post_counts.author_user_id = thread.created_by_user_id
     WHERE thread.id = ? AND thread.campaign_id = ?
     LIMIT 1`,
    [threadId, campaignId]
  );
  const thread = threadRows[0];
  if (!thread) return null;
  const permissions = threadPermissions(thread.visibilityLevel, effectiveAccess);

  const postRows = await query(
     `SELECT
       campaign_forum_posts.id,
       campaign_forum_posts.author_user_id AS authorUserId,
       author.display_name AS authorDisplayName,
       author.email AS authorEmail,
       author.profile_image_url AS authorProfileImageUrl,
       author.use_gravatar AS authorUseGravatar,
       author.updated_at AS authorUpdatedAt,
       author_post_counts.postCount AS authorPostCount,
       campaign_forum_posts.body_bbcode AS body,
       campaign_forum_posts.deleted_at AS deletedAt,
       campaign_forum_posts.edited_at AS editedAt,
       campaign_forum_posts.created_at AS createdAt,
       campaign_forum_posts.updated_at AS updatedAt
     FROM campaign_forum_posts
     LEFT JOIN users author
       ON campaign_forum_posts.author_user_id = CONCAT('user:', author.id)
     LEFT JOIN (
       SELECT author_user_id, COUNT(*) AS postCount
       FROM campaign_forum_posts
       GROUP BY author_user_id
     ) author_post_counts ON author_post_counts.author_user_id = campaign_forum_posts.author_user_id
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
  const readRows = viewerUserId ? await query(
    `SELECT last_read_post_id AS lastReadPostId
     FROM campaign_forum_thread_reads
     WHERE thread_id = ? AND user_id = ?
     LIMIT 1`,
    [thread.id, viewerUserId]
  ) : [];
  const lastReadPostId = Number(readRows[0]?.lastReadPostId || 0);
  const subscriptionRows = viewerUserId ? await query(
    `SELECT notify_pending AS notifyPending
     FROM campaign_forum_thread_subscriptions
     WHERE thread_id = ? AND user_id = ?
     LIMIT 1`,
    [thread.id, viewerUserId]
  ) : [];
  const unreadPosts = postRows.filter((post) => (
    viewerUserId &&
    post.authorUserId !== viewerUserId &&
    Number(post.id) > lastReadPostId
  ));
  const authorLabels = await loadForumAuthorLabels(campaignId, [
    thread.createdByUserId,
    ...postRows.map((post) => post.authorUserId)
  ]);

  return {
    ...formatThreadSummary({
      ...thread,
      createdByRoleLabel: authorLabels.get(thread.createdByUserId) || '',
      postCount: postRows.length,
      latestPostAt: postRows.at(-1)?.createdAt || thread.updatedAt,
      unreadCount: unreadPosts.length
    }, permissions),
    permissions,
    firstUnreadPostId: unreadPosts[0] ? Number(unreadPosts[0].id) : null,
    lastReadPostId: lastReadPostId || null,
    subscribed: Boolean(subscriptionRows.length),
    notificationPending: Boolean(subscriptionRows[0]?.notifyPending),
    posts: postRows.map((post) => ({
      id: Number(post.id),
      authorUserId: post.authorUserId,
      authorDisplayName: post.authorDisplayName || post.authorUserId,
      authorRoleLabel: authorLabels.get(post.authorUserId) || '',
      authorAvatarUrl: userAvatarUrl({
        email: post.authorEmail,
        profileImageUrl: post.authorProfileImageUrl,
        useGravatar: post.authorUseGravatar,
        updatedAt: post.authorUpdatedAt
      }),
      authorPostCount: Number(post.authorPostCount || 0),
      unread: unreadPosts.some((unreadPost) => Number(unreadPost.id) === Number(post.id)),
      body: post.body,
      deleted: Boolean(post.deletedAt),
      deletedAt: post.deletedAt,
      editedAt: post.editedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      rolls: rollsByPostId.get(Number(post.id)) || [],
      canEdit: permissions.canEditOwnPosts && post.authorUserId === viewerUserId && !post.deletedAt,
      canDelete: (post.authorUserId === viewerUserId || effectiveAccess?.isOwner) && !post.deletedAt
    }))
  };
}

function formatThreadSummary(row, permissions = null) {
  return {
    id: Number(row.id),
    title: row.title,
    visibilityLevel: normalizeForumThreadVisibility(row.visibilityLevel),
    mapId: row.mapId ? Number(row.mapId) : null,
    mapName: row.mapName || '',
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName || row.createdByUserId,
    createdByRoleLabel: row.createdByRoleLabel || '',
    createdByAvatarUrl: userAvatarUrl({
      email: row.createdByEmail,
      profileImageUrl: row.createdByProfileImageUrl,
      useGravatar: row.createdByUseGravatar,
      updatedAt: row.createdByUpdatedAt
    }),
    createdByPostCount: Number(row.createdByPostCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    postCount: Number(row.postCount || 0),
    unreadCount: Number(row.unreadCount || 0),
    hasUnread: Number(row.unreadCount || 0) > 0,
    latestPostAt: row.latestPostAt || row.updatedAt,
    permissions: permissions ?? threadPermissions(row.visibilityLevel, null)
  };
}

function userPublicId(user) {
  return user?.id ? `user:${user.id}` : '';
}

function normalizeForumThreadVisibility(visibilityLevel) {
  if (['demo', 'public', 'campaign', 'hidden'].includes(visibilityLevel)) return visibilityLevel;
  return 'campaign';
}

function threadPermissions(visibilityLevel, access = null) {
  const normalized = normalizeForumThreadVisibility(visibilityLevel);
  const isMember = Boolean(access?.isMember);
  const isOwner = Boolean(access?.isOwner);
  const signedIn = Boolean(access?.viewerUserId || isMember || isOwner);
  const canView =
    normalized === 'demo' ||
    normalized === 'public' ||
    (normalized === 'campaign' && isMember) ||
    (normalized === 'hidden' && isOwner);
  const canPost =
    signedIn &&
    (
      normalized === 'demo' ||
      ((normalized === 'public' || normalized === 'campaign') && isMember) ||
      (normalized === 'hidden' && isOwner)
    );

  return {
    canView,
    canPost,
    canEditOwnPosts: canPost,
    canManageVisibility: isOwner
  };
}

async function loadForumAuthorLabels(campaignId, authorUserIds) {
  const uniqueUserIds = [...new Set(authorUserIds.filter(Boolean))];
  if (!uniqueUserIds.length) return new Map();
  const rows = await query(
    `SELECT
       users.user_id AS userId,
       CASE
         WHEN users.user_id = campaign.owner_user_id THEN 'Game Master'
         ELSE COALESCE(player_cast.name, '')
       END AS roleLabel
     FROM (
       ${uniqueUserIds.map(() => 'SELECT ? AS user_id').join(' UNION ALL ')}
     ) users
     INNER JOIN campaigns campaign ON campaign.id = ?
     LEFT JOIN campaign_cast player_cast
       ON player_cast.campaign_id = campaign.id
      AND player_cast.cast_type = 'player'
      AND player_cast.owner_user_id = users.user_id`,
    [...uniqueUserIds, campaignId]
  );
  return new Map(rows.map((row) => [row.userId, row.roleLabel || '']));
}

function userAvatarUrl({ email, profileImageUrl, useGravatar, updatedAt }) {
  if (useGravatar && email) {
    const hash = crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');
    const version = updatedAt ? `&v=${encodeURIComponent(new Date(updatedAt).getTime() || String(updatedAt))}` : '';
    return `https://www.gravatar.com/avatar/${hash}?s=128&d=identicon${version}`;
  }
  return profileImageUrl || '';
}
