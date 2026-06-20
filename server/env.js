import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  appRoot,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 3001),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  tileAssetDir: path.resolve(appRoot, process.env.TILE_ASSET_DIR || 'assets/tiles'),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intFromEnv('DB_PORT', 3306),
    user: process.env.DB_USER || 'pbphud_map',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pbphud_maps',
    connectionLimit: intFromEnv('DB_CONNECTION_LIMIT', 10)
  }
};
