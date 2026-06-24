import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabase } from './db.js';
import { config } from './env.js';
import { attachUser } from './auth.js';
import { startForumNotificationDigestScheduler } from './forumNotifications.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { contactRouter } from './routes/contact.js';
import { mapsRouter } from './routes/maps.js';
import { assetsRouter } from './routes/assets.js';
import { integrationsRouter } from './routes/integrations.js';
import { publicForumsRouter } from './routes/publicForums.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const app = express();

app.use(helmet({
  hsts: config.nodeEnv === 'production',
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/db/health', async (_req, res, next) => {
  try {
    await checkDatabase();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use('/api/maps', mapsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/contact', contactRouter);
app.use('/api/public-forums', publicForumsRouter);
app.use('/api/admin', adminRouter);
app.use('/tiles', express.static(config.tileAssetDir, {
  immutable: true,
  maxAge: '7d',
  index: false
}));

if (config.nodeEnv !== 'production') {
  app.get('/', (_req, res) => {
    res.type('html').send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>PBPHud Map API</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 40px; color: #172033; }
            code, a { color: #2563eb; }
          </style>
        </head>
        <body>
          <h1>PBPHud Map API</h1>
          <p>The backend is running. In development, open the React app at <a href="${config.clientOrigin}">${config.clientOrigin}</a>.</p>
          <p>API health check: <a href="/api/health"><code>/api/health</code></a></p>
        </body>
      </html>
    `);
  });
}

if (config.nodeEnv === 'production') {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: error.message || 'Internal server error'
  });
});

app.listen(config.port, () => {
  console.log(`Map API listening on port ${config.port}`);
  console.log(`Map API public origin: ${config.apiOrigin}`);
  console.log(`Serving tile assets from ${config.tileAssetDir}`);
  startForumNotificationDigestScheduler();
  console.log('Forum notification digest scheduler started');
});
