import express from 'express';
import { query, transaction } from '../db.js';
import { mergeTile, parseLegacyMapData, serializeLegacyMapData } from '../legacyMapCodec.js';
import { resolveTileAssets } from '../tileRegistry.js';
import { createMapSchema, entityPatchSchema, replaceMapSchema, tilePatchSchema, validate } from '../validation.js';

export const mapsRouter = express.Router();

mapsRouter.get('/', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const rows = await query(`
      SELECT
        maps.id,
        maps.group_name AS groupName,
        maps.map_name AS mapName,
        maps.grid_size AS gridSize,
        COALESCE(maps.grid_width, maps.grid_size) AS gridWidth,
        COALESCE(maps.grid_height, maps.grid_size) AS gridHeight,
        maps.version,
        maps.updated_at AS updatedAt,
        vtt_campaigns.external_campaign_id AS campaignId,
        vtt_campaigns.name AS campaignName,
        vtt_campaigns.owner_user_id AS campaignOwnerUserId,
        viewer_member.user_id AS viewerMemberUserId
      FROM maps
      LEFT JOIN vtt_campaigns
        ON vtt_campaigns.provider = 'chummer-web-next-sr4'
       AND vtt_campaigns.external_campaign_id = maps.group_name
      LEFT JOIN vtt_campaign_members viewer_member
        ON viewer_member.provider = vtt_campaigns.provider
       AND viewer_member.external_campaign_id = vtt_campaigns.external_campaign_id
       AND viewer_member.user_id = ?
      ORDER BY maps.group_name, maps.map_name
    `, [viewerUserId]);
    res.json({
      maps: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        gridSize: Number(row.gridSize),
        gridWidth: Number(row.gridWidth),
        gridHeight: Number(row.gridHeight),
        version: Number(row.version),
        permissions: permissionsFromRow(row, viewerUserId)
      }))
    });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const body = validate(createMapSchema, req.body);
    const permissions = await loadCampaignPermissions(body.groupName, viewerUserId);
    if (!permissions.canCreateMaps) {
      res.status(403).json({ error: 'Only the campaign owner can create maps' });
      return;
    }

    await query(
      `INSERT INTO maps (group_name, map_name, grid_size, grid_width, grid_height, legacy_map_data, legacy_map_data2)
       VALUES (?, ?, ?, ?, ?, '', '')`,
      [body.groupName, body.mapName, Math.max(body.gridWidth, body.gridHeight), body.gridWidth, body.gridHeight]
    );
    const map = await getMap(body.groupName, body.mapName);
    res.status(201).json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    next(error);
  }
});

mapsRouter.get('/:groupName/:mapName', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const map = await getMap(req.params.groupName, req.params.mapName);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    const permissions = permissionsFromRow(map, viewerUserId);
    if (map.campaign_id && !permissions.canViewMap) {
      res.status(403).json({ error: 'Only campaign members can view this map' });
      return;
    }
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.put('/:groupName/:mapName', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadCampaignPermissions(req.params.groupName, viewerUserId);
    if (!permissions.canEditMaps) {
      res.status(403).json({ error: 'Only the campaign owner can edit this map' });
      return;
    }

    const body = validate(replaceMapSchema, req.body);
    const legacyMapData = serializeLegacyMapData({ tiles: body.tiles, notes: body.notes });

    const result = await transaction(async (connection) => {
      const updateResult = await connection.query(
        `UPDATE maps
         SET
           grid_size = COALESCE(?, grid_size),
           grid_width = COALESCE(?, grid_width, grid_size),
           grid_height = COALESCE(?, grid_height, grid_size),
           legacy_map_data = ?,
           version = version + 1
         WHERE group_name = ? AND map_name = ?`,
        [
          body.gridWidth && body.gridHeight ? Math.max(body.gridWidth, body.gridHeight) : body.gridSize ?? null,
          body.gridWidth ?? null,
          body.gridHeight ?? null,
          legacyMapData,
          req.params.groupName,
          req.params.mapName
        ]
      );

      if (updateResult.affectedRows === 0) return updateResult;

      const rows = await connection.query(
        `SELECT id FROM maps WHERE group_name = ? AND map_name = ? LIMIT 1`,
        [req.params.groupName, req.params.mapName]
      );
      await saveEditorState(connection, rows[0].id, body);
      return updateResult;
    });

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    const map = await getMap(req.params.groupName, req.params.mapName);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:groupName/:mapName/tiles', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadCampaignPermissions(req.params.groupName, viewerUserId);
    if (!permissions.canEditMaps) {
      res.status(403).json({ error: 'Only the campaign owner can edit map tiles' });
      return;
    }

    const body = validate(tilePatchSchema, req.body);

    const mapUpdated = await transaction(async (connection) => {
      const rows = await connection.query(
        `SELECT * FROM maps WHERE group_name = ? AND map_name = ? FOR UPDATE`,
        [req.params.groupName, req.params.mapName]
      );
      const existingMap = rows[0];
      if (!existingMap) return null;

      const layer = body.layer ?? body.tileCode[0];
      const legacyMapData = mergeTile(existingMap.legacy_map_data, { ...body, layer });
      await connection.query(
        `UPDATE maps SET legacy_map_data = ?, version = version + 1 WHERE id = ?`,
        [legacyMapData, existingMap.id]
      );

      return true;
    });

    if (!mapUpdated) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    const map = await getMap(req.params.groupName, req.params.mapName);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.patch('/:groupName/:mapName/entities/:entityId', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const body = validate(entityPatchSchema, req.body);
    const result = await patchEntity(req.params.groupName, req.params.mapName, req.params.entityId, viewerUserId, body);

    if (result === 'not-found') {
      res.status(404).json({ error: 'Map or entity not found' });
      return;
    }

    if (result === 'forbidden') {
      res.status(403).json({ error: 'You can only control your own player entities' });
      return;
    }

    const map = await getMap(req.params.groupName, req.params.mapName);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

async function getMap(groupName, mapName) {
  const rows = await query(
    `SELECT
       maps.id,
       maps.group_name,
       maps.map_name,
       maps.grid_size,
       maps.grid_width,
       maps.grid_height,
       maps.legacy_map_data,
       maps.legacy_map_data2,
       maps.version,
       maps.updated_at,
       vtt_campaigns.external_campaign_id AS campaign_id,
       vtt_campaigns.name AS campaign_name,
       vtt_campaigns.owner_user_id AS campaign_owner_user_id,
       vtt_campaigns.owner_display_name AS campaign_owner_display_name,
       map_editor_state.cell_size,
       map_editor_state.background_json,
       map_editor_state.drawings_json,
       map_editor_state.entities_json
     FROM maps
     LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
     LEFT JOIN vtt_campaigns
       ON vtt_campaigns.provider = 'chummer-web-next-sr4'
      AND vtt_campaigns.external_campaign_id = maps.group_name
     WHERE group_name = ? AND map_name = ?
     LIMIT 1`,
    [groupName, mapName]
  );
  return rows[0] ?? null;
}

async function saveEditorState(connection, mapId, state) {
  await connection.query(
    `INSERT INTO map_editor_state (map_id, cell_size, background_json, drawings_json, entities_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cell_size = VALUES(cell_size),
       background_json = VALUES(background_json),
       drawings_json = VALUES(drawings_json),
       entities_json = VALUES(entities_json)`,
    [
      mapId,
      state.cellSize,
      JSON.stringify(state.backgroundImage ?? {}),
      JSON.stringify(state.drawings ?? []),
      JSON.stringify(state.entities ?? [])
    ]
  );
}

async function presentMap(row, viewerUserId = '') {
  const parsed = parseLegacyMapData(row.legacy_map_data);
  const assetsByCode = await resolveTileAssets(parsed.tiles.map((tile) => tile.tileCode));
  const tiles = parsed.tiles.map((tile) => {
    const asset = assetsByCode.get(tile.tileCode);
    return asset ? { ...tile, ...asset, tileCode: tile.tileCode } : tile;
  });

  return {
    id: Number(row.id),
    groupName: row.group_name,
    mapName: row.map_name,
    gridSize: Number(row.grid_size),
    gridWidth: Number(row.grid_width || row.grid_size),
    gridHeight: Number(row.grid_height || row.grid_size),
    cellSize: Number(row.cell_size || 50),
    backgroundImage: parseJson(row.background_json, {
      src: '',
      width: 1000,
      height: 1000,
      offsetX: 0,
      offsetY: 0
    }),
    drawings: parseJson(row.drawings_json, []),
    entities: parseJson(row.entities_json, []),
    campaign: row.campaign_id ? {
      id: row.campaign_id,
      name: row.campaign_name,
      ownerUserId: row.campaign_owner_user_id,
      ownerDisplayName: row.campaign_owner_display_name
    } : null,
    permissions: permissionsFromRow(row, viewerUserId),
    version: Number(row.version),
    updatedAt: row.updated_at,
    tiles,
    notes: parsed.notes,
    unknownSegments: parsed.unknownSegments,
    rawLegacyMapData: row.legacy_map_data,
    rawLegacyMapData2: row.legacy_map_data2
  };
}

async function loadCampaignPermissions(groupName, viewerUserId) {
  const rows = await query(
    `SELECT
       vtt_campaigns.external_campaign_id AS campaign_id,
       vtt_campaigns.owner_user_id AS campaign_owner_user_id,
       viewer_member.user_id AS viewer_member_user_id
     FROM vtt_campaigns
     LEFT JOIN vtt_campaign_members viewer_member
       ON viewer_member.provider = vtt_campaigns.provider
      AND viewer_member.external_campaign_id = vtt_campaigns.external_campaign_id
      AND viewer_member.user_id = ?
     WHERE vtt_campaigns.provider = 'chummer-web-next-sr4'
       AND vtt_campaigns.external_campaign_id = ?
     LIMIT 1`,
    [viewerUserId, groupName]
  );

  const row = rows[0];
  if (!row) {
    return legacyPermissions();
  }

  return permissionsFromRow(row, viewerUserId);
}

function permissionsFromRow(row, viewerUserId = '') {
  if (!row.campaign_id && !row.campaignId) {
    return legacyPermissions();
  }

  const ownerUserId = row.campaign_owner_user_id ?? row.campaignOwnerUserId ?? '';
  const memberUserId = row.viewer_member_user_id ?? row.viewerMemberUserId ?? '';
  const canEditMaps = Boolean(viewerUserId && ownerUserId === viewerUserId);
  const canViewMap = canEditMaps || Boolean(viewerUserId && memberUserId === viewerUserId);

  return {
    canViewMap,
    canCreateMaps: canEditMaps,
    canEditMaps,
    canEditTiles: canEditMaps,
    canEditDrawings: canEditMaps,
    canEditBackground: canEditMaps,
    canManageEntities: canEditMaps,
    canUseMeasurements: canViewMap,
    canControlEntities: canViewMap
  };
}

function legacyPermissions() {
  return {
    canViewMap: true,
    canCreateMaps: true,
    canEditMaps: true,
    canEditTiles: true,
    canEditDrawings: true,
    canEditBackground: true,
    canManageEntities: true,
    canUseMeasurements: true,
    canControlEntities: true
  };
}

async function patchEntity(groupName, mapName, entityId, viewerUserId, patch) {
  return transaction(async (connection) => {
    const rows = await connection.query(
      `SELECT
         maps.id,
         vtt_campaigns.owner_user_id AS campaign_owner_user_id,
         map_editor_state.entities_json
       FROM maps
       LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
       LEFT JOIN vtt_campaigns
         ON vtt_campaigns.provider = 'chummer-web-next-sr4'
        AND vtt_campaigns.external_campaign_id = maps.group_name
       WHERE maps.group_name = ? AND maps.map_name = ?
       LIMIT 1
       FOR UPDATE`,
      [groupName, mapName]
    );

    const map = rows[0];
    if (!map) return 'not-found';

    const entities = parseJson(map.entities_json, []);
    const entityIndex = entities.findIndex((entity) => entity.id === entityId);
    if (entityIndex < 0) return 'not-found';

    const entity = entities[entityIndex];
    const isCampaignOwner = Boolean(viewerUserId && map.campaign_owner_user_id === viewerUserId);
    const isEntityOwner = canViewerControlEntity(entity, entities, viewerUserId);
    if (!isCampaignOwner && !isEntityOwner) return 'forbidden';

    const nextEntity = {
      ...entity,
      ...patch
    };
    if (nextEntity.maxHp < 1) nextEntity.maxHp = 1;
    if (nextEntity.hp > nextEntity.maxHp) nextEntity.hp = nextEntity.maxHp;
    entities[entityIndex] = nextEntity;

    await connection.query(
      `INSERT INTO map_editor_state (map_id, cell_size, background_json, drawings_json, entities_json)
       VALUES (?, 50, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entities_json = VALUES(entities_json)`,
      [map.id, JSON.stringify({}), JSON.stringify([]), JSON.stringify(entities)]
    );

    return 'updated';
  });
}

function canViewerControlEntity(entity, entities, viewerUserId) {
  if (!viewerUserId) return false;
  if (entity.ownerId === viewerUserId) return true;
  if (entity.type !== 'charmie' || !entity.ownerId) return false;

  const ownerEntity = entities.find((candidate) => candidate.id === entity.ownerId);
  return ownerEntity?.ownerId === viewerUserId;
}

function getViewerUserId(req) {
  return String(req.get('x-pbphud-viewer-id') || req.query.viewerUserId || '').trim();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
