import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { FeedService } from '../server/feed';

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp(new FeedService()).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

it('sirve un estado operativo y una instantánea de demostración sin caché', async () => {
  expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ status: 'ok' });
  const response = await fetch(`${base}/api/transit`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result = await response.json();
  expect(result.mode).toBe('demo');
  expect(result.data.routes).toHaveLength(2);
  expect(result.data.stops).toHaveLength(7);
  expect(result.data.vehicles).toHaveLength(4);
});

it('devuelve JSON para una ruta API inexistente', async () => {
  const response = await fetch(`${base}/api/missing`);
  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toContain('application/json');
});
