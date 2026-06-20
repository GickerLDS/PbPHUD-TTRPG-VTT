import express from 'express';
import { query, transaction } from '../db.js';
import { mergeTile, parseLegacyMapData, serializeLegacyMapData } from '../legacyMapCodec.js';
import { resolveTileAssets } from '../tileRegistry.js';
import { createMapSchema, replaceMapSchema, tilePatchSchema, validate } from '../validation.js';

export const mapsRouter = express.Router();

mapsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        id,
        group_name AS groupName,
        map_name AS mapName,
        grid_size AS gridSize,
        COALESCE(grid_width, grid_size) AS gridWidth,
        COALESCE(grid_height, grid_size) AS gridHeight,
        version,
        updated_at AS updatedAt
      FROM maps
      ORDER BY group_name, map_name
    `);
    res.json({
      maps: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        gridSize: Number(row.gridSize),
        gridWidth: Number(row.gridWidth),
        gridHeight: Number(row.gridHeight),
        version: Number(row.version)
      }))
    });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createMapSchema, req.body);
    await query(
      `INSERT INTO maps (group_name, map_name, grid_size, grid_width, grid_height, legacy_map_data, legacy_map_data2)
       VALUES (?, ?, ?, ?, ?, '', '')`,
      [body.groupName, body.mapName, Math.max(body.gridWidth, body.gridHeight), body.gridWidth, body.gridHeight]
    );
    const map = await getMap(body.groupName, body.mapName);
    res.status(201).json({ map: await presentMap(map) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    next(error);
  }
});

mapsRouter.get('/:groupName/:mapName', async (req, res, next) => {
  try {
    const map = await getMap(req.params.groupName, req.params.mapName);
    if (!map) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }
    res.json({ map: await presentMap(map) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.put('/:groupName/:mapName', async (req, res, next) => {
  try {
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
    res.json({ map: await presentMap(map) });
  } catch (error) {
    next(error);
  }
});

mapsRouter.post('/:groupName/:mapName/tiles', async (req, res, next) => {
  try {
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
    res.json({ map: await presentMap(map) });
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
       map_editor_state.cell_size,
       map_editor_state.background_json,
       map_editor_state.drawings_json,
       map_editor_state.entities_json
     FROM maps
     LEFT JOIN map_editor_state ON map_editor_state.map_id = maps.id
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

async function presentMap(row) {
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
    version: Number(row.version),
    updatedAt: row.updated_at,
    tiles,
    notes: parsed.notes,
    unknownSegments: parsed.unknownSegments,
    rawLegacyMapData: row.legacy_map_data,
    rawLegacyMapData2: row.legacy_map_data2
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
