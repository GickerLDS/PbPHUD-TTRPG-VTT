import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import 'dotenv/config';

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

const clientHost = process.env.CLIENT_HOST || '127.0.0.1';
const clientPort = intFromEnv('CLIENT_PORT', 5173);
const clientOrigin =
  process.env.CLIENT_ORIGIN ||
  `${process.env.CLIENT_PROTOCOL || 'http'}://${clientHost}:${clientPort}`;
const apiTarget =
  process.env.API_ORIGIN ||
  `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || '127.0.0.1'}:${intFromEnv('PORT', 3001)}`;

function hostFromOrigin(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

const allowedHosts = [
  hostFromOrigin(clientOrigin),
  process.env.CLIENT_ALLOWED_HOSTS
]
  .join(',')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    host: clientHost,
    port: clientPort,
    allowedHosts,
    proxy: {
      '/api': apiTarget,
      '/tiles': apiTarget
    }
  }
});
