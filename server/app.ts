import express from 'express';
import path from 'node:path';
import { createTransitSource } from './source.ts';
import type { Snapshot } from '../src/transit.ts';

export function createApp(service: { get(): Promise<Snapshot> } = createTransitSource()) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/transit', async (_req, res) => {
    const snapshot = await service.get();
    res.set('Cache-Control', 'no-store').status(snapshot.status === 'unavailable' ? 503 : 200).json(snapshot);
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint no encontrado' }));
  const dist = path.resolve(import.meta.dirname, '../dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  return app;
}
