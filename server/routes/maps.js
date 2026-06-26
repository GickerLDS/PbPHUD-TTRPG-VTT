import express from 'express';
import { query, transaction } from '../db.js';
import { mergeTile, parseLegacyMapData, serializeLegacyMapData } from '../legacyMapCodec.js';
import { resolveTileAssets } from '../tileRegistry.js';
import {
  createEntitySchema,
  createMapSchema,
  entityPatchSchema,
  mapVisibilitySchema,
  mapShareSchema,
  replaceMapSchema,
  tilePatchSchema,
  validate
} from '../validation.js';

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
        maps.owner_user_id AS ownerUserId,
        maps.player_visible AS playerVisible,
        maps.visibility_level AS visibilityLevel,
        maps.version,
        maps.updated_at AS updatedAt,
        viewer_share.user_id AS viewerShareUserId,
        vtt_campaigns.external_campaign_id AS campaignId,
        vtt_campaigns.name AS campaignName,
        vtt_campaigns.owner_user_id AS campaignOwnerUserId,
        viewer_member.user_id AS viewerMemberUserId,
        viewer_user.community_role AS viewerCommunityRole
      FROM maps
      LEFT JOIN map_shares viewer_share
        ON viewer_share.map_id = maps.id
       AND viewer_share.user_id = ?
      LEFT JOIN vtt_campaigns
        ON vtt_campaigns.provider = 'chummer-web-next-sr4'
       AND vtt_campaigns.external_campaign_id = maps.group_name
      LEFT JOIN vtt_campaign_members viewer_member
        ON viewer_member.provider = vtt_campaigns.provider
       AND viewer_member.external_campaign_id = vtt_campaigns.external_campaign_id
       AND viewer_member.user_id = ?
      LEFT JOIN users viewer_user
        ON CONCAT('user:', viewer_user.id) = ?
      WHERE maps.owner_user_id IS NULL
         OR maps.owner_user_id = ?
         OR viewer_share.user_id IS NOT NULL
         OR maps.visibility_level IN ('public', 'demo')
         OR vtt_campaigns.owner_user_id = ?
         OR viewer_member.user_id IS NOT NULL
      ORDER BY maps.group_name, maps.map_name
    `, [viewerUserId, viewerUserId, viewerUserId, viewerUserId, viewerUserId]);
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
    if (!viewerUserId) {
      res.status(401).json({ error: 'Confirm a Viewer ID before creating maps' });
      return;
    }
    const body = validate(createMapSchema, req.body);

    await query(
      `INSERT INTO maps (group_name, map_name, grid_size, grid_width, grid_height, owner_user_id, legacy_map_data, legacy_map_data2)
       VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [body.groupName, body.mapName, Math.max(body.gridWidth, body.gridHeight), body.gridWidth, body.gridHeight, viewerUserId]
    );
    const map = await getMap(body.groupName, body.mapName, viewerUserId);
    res.status(201).json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    next(error);
  }
});

mapsRouter.get('/:groupName/:mapName', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    const permissions = permissionsFromRow(map, viewerUserId);
    if (!permissions.canViewMap) {
      res.status(403).json({ error: 'Only the map owner and shared users can view this map' });
      return;
    }
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.get('/:mapId', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const map = await getMapById(req.params.mapId, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    const permissions = permissionsFromRow(map, viewerUserId);
    if (!permissions.canViewMap) {
      res.status(403).json({ error: 'Only the map owner or invited campaign players can view this map' });
      return;
    }
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.patch('/:mapId/visibility', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const viewerUserId = getViewerUserId(req);
    const map = await getMapById(req.params.mapId, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    if (!canManageMapVisibility(map, viewerUserId)) {
      res.status(403).json({ error: 'Only the campaign owner can change map visibility' });
      return;
    }
    const body = validate(mapVisibilitySchema, req.body);
    await query(
      `UPDATE maps SET visibility_level = ?, player_visible = ? WHERE id = ?`,
      [body.visibilityLevel, body.visibilityLevel !== 'hidden', req.params.mapId]
    );
    const updatedMap = await getMapById(req.params.mapId, viewerUserId);
    res.json({ map: await presentMap(updatedMap, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:mapId/campaign-invites', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const viewerUserId = getViewerUserId(req);
    const map = await getMapById(req.params.mapId, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    const permissions = permissionsFromRow(map, viewerUserId);
    if (!permissions.canEditMaps) {
      res.status(403).json({ error: 'Only the map owner can invite players to this map' });
      return;
    }
    const body = validate(mapShareSchema, req.body);
    if (!map.campaign_id) {
      res.status(400).json({ error: 'Map is not part of a campaign' });
      return;
    }
    const memberRows = await query(
      `SELECT user_id FROM campaign_members WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
      [map.campaign_id, body.userId]
    );
    if (!memberRows[0]) {
      res.status(400).json({ error: 'User must be invited to the campaign before they can be invited to this map' });
      return;
    }
    await query(
      `INSERT INTO map_campaign_invites (map_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [req.params.mapId, body.userId]
    );
    const updatedMap = await getMapById(req.params.mapId, viewerUserId);
    res.json({ map: await presentMap(updatedMap, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.put('/:groupName/:mapName', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadMapPermissions(req.params.groupName, req.params.mapName, viewerUserId);
    if (!permissions.canEditMaps) {
      res.status(403).json({ error: 'Only the map owner can edit map settings' });
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

    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:groupName/:mapName/tiles', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadMapPermissions(req.params.groupName, req.params.mapName, viewerUserId);
    if (!permissions.canEditTiles) {
      res.status(403).json({ error: 'Only the map owner can edit map tiles' });
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

    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:groupName/:mapName/entities', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadMapPermissions(req.params.groupName, req.params.mapName, viewerUserId);
    if (!permissions.canCreateEntities) {
      res.status(403).json({ error: 'Only the map owner and shared users can add player entities' });
      return;
    }

    const body = validate(createEntitySchema, req.body);
    const entity = await addEntity(req.params.groupName, req.params.mapName, viewerUserId, permissions, body);
    if (!entity) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.status(201).json({ entity, map: await presentMap(map, viewerUserId) });
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

    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.json({ map: await presentMap(map, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:groupName/:mapName/shares', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadMapPermissions(req.params.groupName, req.params.mapName, viewerUserId);
    if (!permissions.canShareMap) {
      res.status(403).json({ error: 'Only the map owner can share this map' });
      return;
    }

    const body = validate(mapShareSchema, req.body);
    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    if (body.userId !== (map.owner_user_id || map.campaign_owner_user_id || '')) {
      await query(
        `INSERT INTO map_shares (map_id, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [map.id, body.userId]
      );
    }

    const updatedMap = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.json({ map: await presentMap(updatedMap, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.delete('/:groupName/:mapName/shares/:userId', async (req, res, next) => {
  try {
    const viewerUserId = getViewerUserId(req);
    const permissions = await loadMapPermissions(req.params.groupName, req.params.mapName, viewerUserId);
    if (!permissions.canShareMap) {
      res.status(403).json({ error: 'Only the map owner can stop sharing this map' });
      return;
    }

    const map = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    await query(`DELETE FROM map_shares WHERE map_id = ? AND user_id = ?`, [map.id, req.params.userId]);
    const updatedMap = await getMap(req.params.groupName, req.params.mapName, viewerUserId);
    res.json({ map: await presentMap(updatedMap, viewerUserId) });
  } catch (error) {
    next(error);
  }
});

async function getMap(groupName, mapName, viewerUserId = '') {
  const rows = await query(
    `SELECT
       maps.id,
       maps.campaign_id,
       maps.group_name,
       maps.map_name,
       maps.grid_size,
       maps.grid_width,
       maps.grid_height,
       maps.owner_user_id,
       maps.player_visible,
       maps.visibility_level,
       maps.legacy_map_data,
       maps.legacy_map_data2,
       maps.version,
       maps.updated_at,
       viewer_share.user_id AS viewer_share_user_id,
       map_invite.user_id AS map_invite_user_id,
       campaigns.name AS local_campaign_name,
       campaigns.owner_user_id AS local_campaign_owner_user_id,
       campaign_member.user_id AS local_campaign_member_user_id,
       campaign_member.member_role AS local_campaign_member_role,
       vtt_campaigns.external_campaign_id AS legacy_campaign_id,
       vtt_campaigns.name AS campaign_name,
       vtt_campaigns.owner_user_id AS campaign_owner_user_id,
       vtt_campaigns.owner_display_name AS campaign_owner_display_name,
       viewer_member.user_id AS viewer_member_user_id,
       viewer_user.community_role AS viewer_community_role,
       map_editor_state.cell_size,
       map_editor_state.background_json,
       map_editor_state.drawings_json,
       map_editor_state.entities_json
     FROM maps
     LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
     LEFT JOIN map_shares viewer_share
       ON viewer_share.map_id = maps.id
      AND viewer_share.user_id = ?
     LEFT JOIN map_campaign_invites map_invite
       ON map_invite.map_id = maps.id
      AND map_invite.user_id = ?
     LEFT JOIN campaigns ON campaigns.id = maps.campaign_id
     LEFT JOIN campaign_members campaign_member
       ON campaign_member.campaign_id = maps.campaign_id
      AND campaign_member.user_id = ?
     LEFT JOIN vtt_campaigns
       ON vtt_campaigns.provider = 'chummer-web-next-sr4'
      AND vtt_campaigns.external_campaign_id = maps.group_name
     LEFT JOIN vtt_campaign_members viewer_member
       ON viewer_member.provider = vtt_campaigns.provider
      AND viewer_member.external_campaign_id = vtt_campaigns.external_campaign_id
      AND viewer_member.user_id = ?
     LEFT JOIN users viewer_user
       ON CONCAT('user:', viewer_user.id) = ?
     WHERE group_name = ? AND map_name = ?
     LIMIT 1`,
    [viewerUserId, viewerUserId, viewerUserId, viewerUserId, viewerUserId, groupName, mapName]
  );
  return rows[0] ?? null;
}

async function getMapById(mapId, viewerUserId = '') {
  const rows = await query(
    `SELECT
       maps.id,
       maps.campaign_id,
       maps.group_name,
       maps.map_name,
       maps.grid_size,
       maps.grid_width,
       maps.grid_height,
       maps.owner_user_id,
       maps.player_visible,
       maps.visibility_level,
       maps.legacy_map_data,
       maps.legacy_map_data2,
       maps.version,
       maps.updated_at,
       viewer_share.user_id AS viewer_share_user_id,
       map_invite.user_id AS map_invite_user_id,
       campaigns.name AS local_campaign_name,
       campaigns.owner_user_id AS local_campaign_owner_user_id,
       campaign_member.user_id AS local_campaign_member_user_id,
       campaign_member.member_role AS local_campaign_member_role,
       vtt_campaigns.external_campaign_id AS legacy_campaign_id,
       vtt_campaigns.name AS campaign_name,
       vtt_campaigns.owner_user_id AS campaign_owner_user_id,
       vtt_campaigns.owner_display_name AS campaign_owner_display_name,
       viewer_member.user_id AS viewer_member_user_id,
       viewer_user.community_role AS viewer_community_role,
       map_editor_state.cell_size,
       map_editor_state.background_json,
       map_editor_state.drawings_json,
       map_editor_state.entities_json
     FROM maps
     LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
     LEFT JOIN map_shares viewer_share
       ON viewer_share.map_id = maps.id
      AND viewer_share.user_id = ?
     LEFT JOIN map_campaign_invites map_invite
       ON map_invite.map_id = maps.id
      AND map_invite.user_id = ?
     LEFT JOIN campaigns ON campaigns.id = maps.campaign_id
     LEFT JOIN campaign_members campaign_member
       ON campaign_member.campaign_id = maps.campaign_id
      AND campaign_member.user_id = ?
     LEFT JOIN vtt_campaigns
       ON vtt_campaigns.provider = 'chummer-web-next-sr4'
      AND vtt_campaigns.external_campaign_id = maps.group_name
     LEFT JOIN vtt_campaign_members viewer_member
       ON viewer_member.provider = vtt_campaigns.provider
      AND viewer_member.external_campaign_id = vtt_campaigns.external_campaign_id
      AND viewer_member.user_id = ?
     LEFT JOIN users viewer_user
       ON CONCAT('user:', viewer_user.id) = ?
     WHERE maps.id = ?
     LIMIT 1`,
    [viewerUserId, viewerUserId, viewerUserId, viewerUserId, viewerUserId, mapId]
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
    campaignId: row.campaign_id ? Number(row.campaign_id) : null,
    groupName: row.group_name,
    mapName: row.map_name,
    gridSize: Number(row.grid_size),
    gridWidth: Number(row.grid_width || row.grid_size),
    gridHeight: Number(row.grid_height || row.grid_size),
    ownerUserId: row.owner_user_id || row.campaign_owner_user_id || '',
    playerVisible: Boolean(row.player_visible),
    visibilityLevel: normalizeVisibilityLevel(row),
    invitedUserIds: await loadMapInviteUserIds(row.id),
    sharedUserIds: await loadSharedUserIds(row.id),
    cellSize: Number(row.cell_size || 50),
    backgroundImage: parseBackgroundImage(row.background_json),
    drawings: parseJson(row.drawings_json, []),
    entities: parseJson(row.entities_json, []),
    campaign: row.campaign_id || row.legacy_campaign_id ? {
      id: row.campaign_id ? Number(row.campaign_id) : row.legacy_campaign_id,
      name: row.local_campaign_name || row.campaign_name,
      ownerUserId: row.local_campaign_owner_user_id || row.campaign_owner_user_id,
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

async function loadSharedUserIds(mapId) {
  const rows = await query(
    `SELECT user_id AS userId FROM map_shares WHERE map_id = ? ORDER BY user_id`,
    [mapId]
  );
  return rows.map((row) => row.userId);
}

async function loadMapInviteUserIds(mapId) {
  const rows = await query(
    `SELECT user_id AS userId FROM map_campaign_invites WHERE map_id = ? ORDER BY user_id`,
    [mapId]
  );
  return rows.map((row) => row.userId);
}

async function loadMapPermissions(groupName, mapName, viewerUserId) {
  const row = await getMap(groupName, mapName, viewerUserId);
  if (!row) return noPermissions();
  return permissionsFromRow(row, viewerUserId);
}

function permissionsFromRow(row, viewerUserId = '') {
  const ownerUserId = row.owner_user_id ?? row.ownerUserId ?? '';
  const campaignOwnerUserId =
    row.local_campaign_owner_user_id ??
    row.localCampaignOwnerUserId ??
    row.campaign_owner_user_id ??
    row.campaignOwnerUserId ??
    '';
  const memberUserId = row.viewer_member_user_id ?? row.viewerMemberUserId ?? '';
  const localMemberUserId = row.local_campaign_member_user_id ?? row.localCampaignMemberUserId ?? '';
  const localMemberRole = row.local_campaign_member_role ?? row.localCampaignMemberRole ?? '';
  const shareUserId = row.viewer_share_user_id ?? row.viewerShareUserId ?? '';
  const mapInviteUserId = row.map_invite_user_id ?? row.mapInviteUserId ?? '';
  const campaignId = row.campaign_id ?? row.campaignId ?? row.legacy_campaign_id ?? row.legacyCampaignId ?? '';
  const visibilityLevel = normalizeVisibilityLevel(row);
  const hasOwner = Boolean(ownerUserId || campaignOwnerUserId);
  const legacyOpen = !hasOwner && !campaignId;
  const isOwner = Boolean(viewerUserId && (ownerUserId === viewerUserId || campaignOwnerUserId === viewerUserId));
  const isCampaignMember = Boolean(
    viewerUserId &&
    (isOwner || localMemberUserId === viewerUserId || memberUserId === viewerUserId)
  );
  const isLocalCampaignLurker = Boolean(!isOwner && localMemberUserId === viewerUserId && localMemberRole === 'lurker');
  const isCampaignMap = Boolean(campaignId);
  const isDemo = visibilityLevel === 'demo';
  const isSiteAdmin = row.viewer_community_role === 'admin' || row.viewerCommunityRole === 'admin';
  const canEditCampaignMap = isCampaignMap && visibilityLevel !== 'hidden' && !isLocalCampaignLurker && (isCampaignMember || isDemo);
  const canEditMaps = legacyOpen || isOwner || canEditCampaignMap || (isDemo && !isLocalCampaignLurker);
  const canViewCampaignMap =
    visibilityLevel === 'public' ||
    visibilityLevel === 'demo' ||
    (visibilityLevel === 'campaign' && isCampaignMember) ||
    (visibilityLevel === 'hidden' && isOwner);
  const isShared = Boolean(!isCampaignMap && viewerUserId && (shareUserId === viewerUserId || mapInviteUserId === viewerUserId));
  const canViewMap = legacyOpen || (isCampaignMap ? canViewCampaignMap : (canEditMaps || isShared));

  return {
    canViewMap,
    canCreateMaps: Boolean(viewerUserId),
    canEditMaps,
    canEditTiles: canEditMaps,
    canEditDrawings: canEditMaps,
    canEditBackground: canEditMaps,
    canManageEntities: canEditMaps,
    canCreateEntities: canViewMap && !isLocalCampaignLurker,
    canUseMeasurements: canViewMap,
    canControlEntities: canViewMap && !isLocalCampaignLurker,
    canShareMap: canEditMaps,
    canDeleteMaps: isDemo ? isSiteAdmin : (legacyOpen || isOwner)
  };
}

function canManageMapVisibility(row, viewerUserId = '') {
  const ownerUserId = row.owner_user_id ?? row.ownerUserId ?? '';
  const campaignOwnerUserId =
    row.local_campaign_owner_user_id ??
    row.localCampaignOwnerUserId ??
    row.campaign_owner_user_id ??
    row.campaignOwnerUserId ??
    '';
  return Boolean(viewerUserId && (ownerUserId === viewerUserId || campaignOwnerUserId === viewerUserId));
}

function normalizeVisibilityLevel(row) {
  const visibilityLevel = row.visibility_level ?? row.visibilityLevel;
  if (visibilityLevel === 'public' || visibilityLevel === 'campaign' || visibilityLevel === 'hidden' || visibilityLevel === 'demo') {
    return visibilityLevel;
  }
  return row.player_visible ?? row.playerVisible ? 'campaign' : 'hidden';
}

function noPermissions() {
  return {
    canViewMap: false,
    canCreateMaps: false,
    canEditMaps: false,
    canEditTiles: false,
    canEditDrawings: false,
    canEditBackground: false,
    canManageEntities: false,
    canCreateEntities: false,
    canUseMeasurements: false,
    canControlEntities: false,
    canShareMap: false,
    canDeleteMaps: false
  };
}

async function addEntity(groupName, mapName, viewerUserId, permissions, body) {
  return transaction(async (connection) => {
    const rows = await connection.query(
      `SELECT
         maps.id,
         map_editor_state.entities_json
       FROM maps
       LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
       WHERE maps.group_name = ? AND maps.map_name = ?
       LIMIT 1
       FOR UPDATE`,
      [groupName, mapName]
    );

    const map = rows[0];
    if (!map) return null;

    const entities = parseJson(map.entities_json, []);
    const entity = {
      ...body,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: permissions.canManageEntities ? body.type : 'player',
      ownerId: permissions.canManageEntities ? body.ownerId || viewerUserId : viewerUserId,
      x: null,
      y: null
    };
    entities.push(entity);

    await connection.query(
      `INSERT INTO map_editor_state (map_id, cell_size, background_json, drawings_json, entities_json)
       VALUES (?, 50, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entities_json = VALUES(entities_json)`,
      [map.id, JSON.stringify({}), JSON.stringify([]), JSON.stringify(entities)]
    );

    return entity;
  });
}

async function patchEntity(groupName, mapName, entityId, viewerUserId, patch) {
  return transaction(async (connection) => {
    const rows = await connection.query(
      `SELECT
         maps.id,
         maps.owner_user_id,
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
    const isMapOwner = Boolean(viewerUserId && (map.owner_user_id === viewerUserId || map.campaign_owner_user_id === viewerUserId));
    const isEntityOwner = canViewerControlEntity(entity, entities, viewerUserId);
    if (!isMapOwner && !isEntityOwner) return 'forbidden';

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
  if (req.user?.id) return `user:${req.user.id}`;
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

function parseBackgroundImage(value) {
  return {
    src: '',
    width: 1000,
    height: 1000,
    offsetX: 0,
    offsetY: 0,
    ...parseJson(value, {})
  };
}
