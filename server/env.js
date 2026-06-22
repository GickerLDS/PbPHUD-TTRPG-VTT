import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function numberFromEnv(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function boolFromEnv(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function originFromEnv(originName, protocolName, hostName, portName, fallbackHost, fallbackPort) {
  const origin = process.env[originName]?.trim();
  if (origin) return origin.replace(/\/$/, '');

  const protocol = process.env[protocolName] || 'http';
  const host = process.env[hostName] || fallbackHost;
  const port = intFromEnv(portName, fallbackPort);
  return `${protocol}://${host}:${port}`;
}

const clientOrigin = originFromEnv(
  'CLIENT_ORIGIN',
  'CLIENT_PROTOCOL',
  'CLIENT_HOST',
  'CLIENT_PORT',
  '127.0.0.1',
  5173
);
const apiOrigin = originFromEnv(
  'API_ORIGIN',
  'API_PROTOCOL',
  'API_HOST',
  'PORT',
  '127.0.0.1',
  3001
);

export const config = {
  appRoot,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 3001),
  apiOrigin,
  clientOrigin,
  corsOrigins: [
    clientOrigin,
    `http://localhost:${intFromEnv('CLIENT_PORT', 5173)}`,
    ...(process.env.CORS_ORIGINS || '').split(',')
  ]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index),
  tileAssetDir: path.resolve(appRoot, process.env.TILE_ASSET_DIR || 'assets/tiles'),
  integrationToken: process.env.PBPHUD_INTEGRATION_TOKEN || '',
  auth: {
    sessionDays: intFromEnv('AUTH_SESSION_DAYS', 14),
    emailVerificationHours: intFromEnv('AUTH_EMAIL_VERIFICATION_HOURS', 24),
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
    recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY || '',
    recaptchaType: process.env.RECAPTCHA_TYPE || 'v3',
    recaptchaMinScore: numberFromEnv('RECAPTCHA_MIN_SCORE', 0.5),
    recaptchaAction: process.env.RECAPTCHA_ACTION || 'register',
    requireRecaptcha: boolFromEnv('REQUIRE_RECAPTCHA', process.env.NODE_ENV === 'production')
  },
  email: {
    from: process.env.MAIL_FROM || 'no-reply@localhost',
    smtp: {
      host: process.env.SMTP_HOST || 'mail.smtp2go.com',
      port: intFromEnv('SMTP_PORT', 587),
      secure: boolFromEnv('SMTP_SECURE', false),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    }
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intFromEnv('DB_PORT', 3306),
    user: process.env.DB_USER || 'pbphud_map',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pbphud_maps',
    connectionLimit: intFromEnv('DB_CONNECTION_LIMIT', 10)
  }
};
