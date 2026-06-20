import express from 'express';
import { listTileAssets, resolveTileAsset } from '../tileRegistry.js';

export const assetsRouter = express.Router();

assetsRouter.get('/tiles', async (_req, res, next) => {
  try {
    const tiles = await listTileAssets();
    res.json({ tiles });
  } catch (error) {
    next(error);
  }
});

assetsRouter.get('/tiles/:code', async (req, res, next) => {
  try {
    const tile = await resolveTileAsset(req.params.code);
    if (!tile) {
      res.status(404).json({ error: 'Tile not found' });
      return;
    }
    res.json({ tile });
  } catch (error) {
    next(error);
  }
});
