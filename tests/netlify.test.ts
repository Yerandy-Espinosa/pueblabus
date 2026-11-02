import { describe, expect, it } from 'vitest';
import { handleRequest } from '../netlify/functions/api';
import { FeedService } from '../server/feed';

describe('API de Netlify', () => {
  it('sirve la misma instantánea en las rutas pública y de función', async () => {
    for (const path of ['/api/transit', '/.netlify/functions/api/transit']) {
      const response = await handleRequest(new Request(`https://pueblabus.example${path}`), new FeedService());
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const snapshot = await response.json();
      expect(snapshot.mode).toBe('demo');
      expect(snapshot.data.vehicles).toHaveLength(4);
    }
  });
  it('sirve salud y rechaza endpoints o métodos no soportados', async () => {
    expect(await (await handleRequest(new Request('https://pueblabus.example/api/health'))).json()).toEqual({ status: 'ok' });
    expect((await handleRequest(new Request('https://pueblabus.example/api/missing'))).status).toBe(404);
    expect((await handleRequest(new Request('https://pueblabus.example/api/transit', { method: 'POST' }))).status).toBe(405);
  });
  it('un fallo del operador devuelve 503 sin convertirse en demo', async () => {
    const source = new FeedService('https://operator.example/feed', async () => { throw new Error('offline'); });
    const response = await handleRequest(new Request('https://pueblabus.example/api/transit'), source);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ mode: 'live', status: 'unavailable', data: null });
  });
});
