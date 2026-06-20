import { layerRank, normalizeTile } from './legacyTiles.js';

export const EDITOR_LAYERS = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'objects', label: 'Objects' },
  { id: 'actors', label: 'Players/NPCs' }
];

export const EDITOR_LAYER_RANK = {
  terrain: 0,
  objects: 1,
  actors: 2
};

export function getEditorLayer(tile) {
  const category = String(tile?.category || '').toLowerCase();

  if (
    category.startsWith('creatures/') ||
    category.startsWith('people/') ||
    category.includes('npc') ||
    category.includes('player') ||
    category.includes('character')
  ) {
    return 'actors';
  }

  if (category.startsWith('terrain/')) return 'terrain';

  return 'objects';
}

export function tileMatchesEditorLayer(tile, editorLayer) {
  return getEditorLayer(tile) === editorLayer;
}

export function editorLayerRank(tile) {
  return EDITOR_LAYER_RANK[getEditorLayer(tile)] ?? EDITOR_LAYER_RANK.objects;
}

export function getTopTileAt(tiles, x, y, editorLayer) {
  return (tiles || [])
    .map(normalizeTile)
    .filter((tile) => tile.x === x && tile.y === y)
    .filter((tile) => !editorLayer || tileMatchesEditorLayer(tile, editorLayer))
    .sort((a, b) => layerRank(a.layer) - layerRank(b.layer))
    .pop();
}

export function columnLabel(index) {
  let value = index;
  let label = '';

  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

export function formatCell(x, y) {
  return `${columnLabel(x)}${y}`;
}
