import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { query, transaction } from '../db.js';
import { config } from '../env.js';
import {
  chummerCampaignImportSchema,
  chummerCreateMapSchema,
  chummerSyncEntitiesSchema,
  validate
} from '../validation.js';

const PROVIDER = 'chummer-web-next-sr4';

export const integrationsRouter = express.Router();

integrationsRouter.use(requireIntegrationToken);

integrationsRouter.put('/chummer/campaigns/:campaignId', async (req, res, next) => {
  try {
    const body = validate(chummerCampaignImportSchema, req.body);
    if (body.campaign.id !== req.params.campaignId) {
      res.status(400).json({ error: 'Campaign ID does not match request path' });
      return;
    }

    await importCampaignRoster(body);
    res.json({ ok: true, campaignId: body.campaign.id, importedCharacters: body.characters.length });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/chummer/campaigns/:campaignId/maps', async (req, res, next) => {
  try {
    const body = validate(chummerCreateMapSchema, req.body);
    const campaign = await loadCampaign(req.params.campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign must be imported before creating maps' });
      return;
    }
    if (campaign.owner_user_id !== body.actorUserId) {
      res.status(403).json({ error: 'Only the campaign owner can create maps' });
      return;
    }

    await query(
      `INSERT INTO maps (group_name, map_name, grid_size, grid_width, grid_height, legacy_map_data, legacy_map_data2)
       VALUES (?, ?, ?, ?, ?, '', '')`,
      [req.params.campaignId, body.mapName, Math.max(body.gridWidth, body.gridHeight), body.gridWidth, body.gridHeight]
    );

    res.status(201).json({
      ok: true,
      map: {
        groupName: req.params.campaignId,
        mapName: body.mapName,
        gridWidth: body.gridWidth,
        gridHeight: body.gridHeight
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    next(error);
  }
});

integrationsRouter.post('/chummer/campaigns/:campaignId/maps/:mapName/entities', async (req, res, next) => {
  try {
    const body = validate(chummerSyncEntitiesSchema, req.body);
    const campaign = await loadCampaign(req.params.campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign must be imported before syncing entities' });
      return;
    }
    if (campaign.owner_user_id !== body.actorUserId) {
      res.status(403).json({ error: 'Only the campaign owner can sync map entities' });
      return;
    }

    const updated = await syncMapEntities(req.params.campaignId, req.params.mapName, body.entities);
    if (!updated) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    res.json({ ok: true, entityCount: body.entities.length });
  } catch (error) {
    next(error);
  }
});

function requireIntegrationToken(req, res, next) {
  const expectedToken = config.integrationToken;
  if (!expectedToken) {
    res.status(503).json({ error: 'PBPHUD integration token is not configured' });
    return;
  }

  const header = req.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!tokensMatch(token, expectedToken)) {
    res.status(401).json({ error: 'Invalid integration token' });
    return;
  }

  next();
}

function tokensMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function importCampaignRoster(body) {
  await transaction(async (connection) => {
    await connection.query(
      `INSERT INTO vtt_campaigns (
        provider,
        external_campaign_id,
        name,
        owner_user_id,
        owner_display_name,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        owner_user_id = VALUES(owner_user_id),
        owner_display_name = VALUES(owner_display_name),
        payload_json = VALUES(payload_json)`,
      [
        PROVIDER,
        body.campaign.id,
        body.campaign.name,
        body.campaign.creatorUserId,
        body.campaign.creatorDisplayName,
        JSON.stringify(body)
      ]
    );

    await connection.query(
      `DELETE FROM vtt_campaign_members
       WHERE provider = ? AND external_campaign_id = ?`,
      [PROVIDER, body.campaign.id]
    );
    for (const member of body.members) {
      await connection.query(
        `INSERT INTO vtt_campaign_members (
          provider,
          external_campaign_id,
          user_id,
          display_name,
          role
        ) VALUES (?, ?, ?, ?, ?)`,
        [PROVIDER, body.campaign.id, member.userId, member.displayName, member.role]
      );
    }

    await connection.query(
      `DELETE FROM vtt_campaign_characters
       WHERE provider = ? AND external_campaign_id = ?`,
      [PROVIDER, body.campaign.id]
    );
    for (const character of body.characters) {
      await connection.query(
        `INSERT INTO vtt_campaign_characters (
          provider,
          external_campaign_id,
          external_character_id,
          owner_user_id,
          owner_display_name,
          name,
          entity_json,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          PROVIDER,
          body.campaign.id,
          character.id,
          character.ownerUserId,
          character.ownerDisplayName,
          character.name,
          JSON.stringify(character.entity),
          character.payload === undefined ? null : JSON.stringify(character.payload)
        ]
      );
    }
  });
}

async function loadCampaign(campaignId) {
  const rows = await query(
    `SELECT *
     FROM vtt_campaigns
     WHERE provider = ? AND external_campaign_id = ?
     LIMIT 1`,
    [PROVIDER, campaignId]
  );
  return rows[0] ?? null;
}

async function syncMapEntities(campaignId, mapName, incomingEntities) {
  return transaction(async (connection) => {
    const rows = await connection.query(
      `SELECT maps.id, map_editor_state.entities_json
       FROM maps
       LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
       WHERE maps.group_name = ? AND maps.map_name = ?
       LIMIT 1`,
      [campaignId, mapName]
    );
    const map = rows[0];
    if (!map) return false;

    const currentEntities = parseJson(map.entities_json, []);
    const incomingById = new Map(incomingEntities.map((entity) => [entity.id, entity]));
    const merged = [
      ...currentEntities.map((entity) => {
        const incoming = incomingById.get(entity.id);
        if (!incoming) return entity;
        incomingById.delete(entity.id);
        return {
          ...incoming,
          x: entity.x ?? incoming.x ?? null,
          y: entity.y ?? incoming.y ?? null
        };
      }),
      ...incomingById.values()
    ];

    await connection.query(
      `INSERT INTO map_editor_state (map_id, cell_size, background_json, drawings_json, entities_json)
       VALUES (?, 50, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entities_json = VALUES(entities_json)`,
      [map.id, JSON.stringify({}), JSON.stringify([]), JSON.stringify(merged)]
    );

    return true;
  });
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
