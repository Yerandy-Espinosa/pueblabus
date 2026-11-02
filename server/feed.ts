import { feedSchema } from '../src/schema.ts';
import type { Feed, Snapshot } from '../src/transit.ts';
import { createDemo } from './demo.ts';

export class FeedService {
  private lastFeed: Feed | null = null;
  private lastFetch = 0;
  private pending: Promise<Snapshot> | null = null;
  private snapshot: Snapshot | null = null;

  constructor(private url?: string, private request: typeof fetch = fetch) {
    if (url && new URL(url).protocol !== 'https:') throw new Error('TRANSIT_FEED_URL must use HTTPS');
  }

  async get(): Promise<Snapshot> {
    if (!this.url) return { mode: 'demo', status: 'ok', message: 'Demostración: posiciones, recorridos, paradas y horarios de ejemplo. No son datos del operador.', data: createDemo() };
    if (this.pending) return this.pending;
    if (this.snapshot && Date.now() - this.lastFetch < 5_000) return this.snapshot;
    this.pending = this.refresh();
    try { return await this.pending; } finally { this.pending = null; }
  }

  private async refresh(): Promise<Snapshot> {
    try {
      const response = await this.request(this.url!, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' }, redirect: 'error' });
      if (!response.ok) throw new Error('Upstream request failed');
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('Feed too large');
      const feed = feedSchema.parse(JSON.parse(text));
      const age = Date.now() - Date.parse(feed.updatedAt);
      if (age < -60_000 || feed.vehicles.some(v => Date.parse(v.updatedAt) > Date.now() + 60_000)) throw new Error('Future timestamp');
      this.lastFeed = feed;
      const stale = age > 60_000 || feed.vehicles.some(v => Date.now() - Date.parse(v.updatedAt) > 60_000);
      this.snapshot = { mode: 'live', status: stale ? 'stale' : 'ok', message: stale ? 'La fuente lleva más de un minuto sin actualizarse. Las posiciones pueden haber cambiado.' : 'Datos recibidos del operador.', data: feed };
    } catch {
      this.snapshot = { mode: 'live', status: this.lastFeed ? 'stale' : 'unavailable', message: this.lastFeed ? 'Sin conexión con el operador. Se muestra la última información recibida.' : 'No se ha podido conectar con el operador. Inténtalo de nuevo en unos instantes.', data: this.lastFeed };
    }
    this.lastFetch = Date.now();
    return this.snapshot;
  }
}
