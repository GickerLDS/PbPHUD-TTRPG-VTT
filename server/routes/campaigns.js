import express from 'express';
import { z } from 'zod';
import { query } from '../db.js';
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

async function loadOwnedCampaign(campaignId, user) {
  const rows = await query(
    `SELECT * FROM campaigns WHERE id = ? AND owner_user_id = ? LIMIT 1`,
    [campaignId, userPublicId(user)]
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

function userPublicId(user) {
  return `user:${user.id}`;
}
