const TILE_RECORD_PREFIX = '_a';
const TEXT_RECORD_PREFIX = '_t';

export const TILE_EXTENSIONS = {
  g: 'gif',
  j: 'jpg',
  p: 'png'
};

export function tileCodeToFilename(tileCode) {
  const suffix = tileCode?.slice(-1)?.toLowerCase();
  const extension = TILE_EXTENSIONS[suffix] || 'gif';
  return `${tileCode}.${extension}`;
}

export function parseLegacyMapData(input = '') {
  const source = String(input || '');
  const tiles = [];
  const notes = [];
  const unknownSegments = [];

  let index = 0;
  while (index < source.length) {
    const markerIndex = source.indexOf('_', index);
    if (markerIndex === -1) break;

    if (source.startsWith(TILE_RECORD_PREFIX, markerIndex) && markerIndex + 12 <= source.length) {
      const x = Number.parseInt(source.slice(markerIndex + 2, markerIndex + 4), 10);
      const y = Number.parseInt(source.slice(markerIndex + 4, markerIndex + 6), 10);
      const tileCode = source.slice(markerIndex + 6, markerIndex + 12);
      const layer = tileCode[0] || 'a';

      if (Number.isFinite(x) && Number.isFinite(y) && tileCode.length === 6) {
        tiles.push({
          x,
          y,
          layer,
          tileCode,
          filename: tileCodeToFilename(tileCode)
        });
        index = markerIndex + 12;
        continue;
      }
    }

    if (source.startsWith(TEXT_RECORD_PREFIX, markerIndex)) {
      const nextMarker = source.indexOf('_', markerIndex + 2);
      const end = nextMarker === -1 ? source.length : nextMarker;
      notes.push(source.slice(markerIndex + 2, end));
      index = end;
      continue;
    }

    const nextMarker = source.indexOf('_', markerIndex + 1);
    const end = nextMarker === -1 ? source.length : nextMarker;
    unknownSegments.push(source.slice(markerIndex, end));
    index = end;
  }

  return { tiles, notes, unknownSegments, raw: source };
}

export function serializeLegacyMapData({ tiles = [], notes = [] } = {}) {
  const tileRecords = [...tiles]
    .filter((tile) => isValidTile(tile))
    .sort((a, b) => a.y - b.y || a.x - b.x || String(a.layer).localeCompare(String(b.layer)))
    .map((tile) => {
      const tileCode = String(tile.tileCode).slice(0, 6);
      return `_a${pad2(tile.x)}${pad2(tile.y)}${tileCode}`;
    });

  const noteRecords = notes
    .map((note) => String(note || '').replace(/_/g, ' ').trim())
    .filter(Boolean)
    .map((note) => `_t${note}`);

  return `${tileRecords.join('')}${noteRecords.join('')}`;
}

export function mergeTile(legacyMapData, patch) {
  const parsed = parseLegacyMapData(legacyMapData);
  const nextTiles = parsed.tiles.filter((tile) => {
    return !(tile.x === patch.x && tile.y === patch.y && tile.layer === patch.layer);
  });

  if (!patch.erase) {
    nextTiles.push({
      x: patch.x,
      y: patch.y,
      layer: patch.layer,
      tileCode: patch.tileCode
    });
  }

  return serializeLegacyMapData({ tiles: nextTiles, notes: parsed.notes });
}

function isValidTile(tile) {
  return (
    Number.isInteger(tile.x) &&
    Number.isInteger(tile.y) &&
    tile.x >= 1 &&
    tile.y >= 1 &&
    /^[A-Za-z0-9#]{6}$/.test(String(tile.tileCode || ''))
  );
}

function pad2(value) {
  return String(Number.parseInt(value, 10)).padStart(2, '0').slice(-2);
}
