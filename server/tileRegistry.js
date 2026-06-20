import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './env.js';

const manifestPath = path.join(config.appRoot, 'assets', 'tile-manifest.json');
const imageExtensions = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp']);

let cachedRegistry;

export async function listTileAssets() {
  const registry = await loadRegistry();
  return registry.tiles;
}

export async function resolveTileAsset(tileCode) {
  const registry = await loadRegistry();
  return registry.byCode.get(tileCode) ?? null;
}

export async function resolveTileAssets(tileCodes) {
  const registry = await loadRegistry();
  return new Map(tileCodes.map((code) => [code, registry.byCode.get(code) ?? null]));
}

async function loadRegistry() {
  if (cachedRegistry) return cachedRegistry;

  const tiles = await loadManifestTiles().catch(() => scanTiles());
  const byCode = new Map();
  for (const tile of tiles) {
    if (!byCode.has(tile.code)) byCode.set(tile.code, tile);
  }

  cachedRegistry = { tiles, byCode };
  return cachedRegistry;
}

async function loadManifestTiles() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return manifest.tiles.map((tile) => ({
    ...tile,
    url: tile.url || `/tiles/${tile.relativePath.split('/').map(encodeURIComponent).join('/')}`
  }));
}

async function scanTiles() {
  const files = await listFiles(config.tileAssetDir);
  return files
    .filter((file) => imageExtensions.has(path.extname(file.absolutePath).toLowerCase()))
    .map((file) => {
      const extension = path.extname(file.absolutePath);
      const baseName = path.basename(file.absolutePath, extension);
      const marker = baseName.lastIndexOf('--');
      const code = marker === -1 ? baseName : baseName.slice(marker + 2);
      const relativePath = file.relativePath;

      return {
        code,
        label: code,
        category: path.dirname(relativePath) === '.' ? 'uncategorized' : path.dirname(relativePath).split(path.sep).join('/'),
        filename: path.basename(relativePath),
        relativePath: relativePath.split(path.sep).join('/'),
        url: `/tiles/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));
}

async function listFiles(root, prefix = '') {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }

  return files;
}
