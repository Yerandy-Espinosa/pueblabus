import { mergeEstimates } from '../src/estimates.ts';
import type { Feed, Snapshot } from '../src/transit.ts';
import { CtasGpsSource, type GpsResult } from './ctas-gps.ts';
import { scheduledSnapshot } from './scheduled.ts';
import { FeedService } from './feed.ts';

export class TransitService {
  constructor(
    private load: (now?: Date) => Promise<Snapshot> = (now) => scheduledSnapshot(undefined, now),
    private gps: { get(feed: Feed, now: Date): Promise<GpsResult> } = new CtasGpsSource(),
    private external?: { get(): Promise<Snapshot> },
    private clock: () => Date = () => new Date(),
  ) {}

  async get(): Promise<Snapshot> {
    const now = this.clock();
    if (this.external) {
      const real = await this.external.get().catch((): Snapshot => ({ mode: 'live', status: 'unavailable', data: null, message: 'GPS no disponible.' }));
      if (real.mode === 'live' && real.status === 'ok' && real.data?.vehicles.some(v => v.positionSource !== 'estimate')) return { ...real, data: { ...real.data, vehicles: real.data.vehicles.map(v => ({ ...v, positionSource: v.positionSource || 'gps' })) }, gps: { status: 'connected', checkedAt: now.toISOString() } };
    }
    const scheduled = await this.load(now);
    if (!scheduled.data) return scheduled;
    const result = this.external
      ? { vehicles: [], status: 'unavailable' as const, source: '' }
      : await this.gps.get(scheduled.data, now).catch(() => ({ vehicles: [], status: 'unavailable' as const, source: '' }));
    const vehicles = mergeEstimates(scheduled.data, result.vehicles, now);
    const hasGps = vehicles.some(v => v.positionSource === 'gps');
    const estimated = vehicles.some(v => v.positionSource === 'estimate');
    const mode = hasGps ? estimated ? 'mixed' : 'live' : 'estimated';
    return { ...scheduled, mode, data: { ...scheduled.data, vehicles, updatedAt: now.toISOString() },
      gps: { status: result.status, checkedAt: now.toISOString(), source: result.source || undefined },
      message: hasGps ? estimated ? 'GPS real donde está disponible; los demás marcadores están estimados según el horario oficial.' : 'Posiciones GPS recibidas del Consorcio. La hora mostrada corresponde a la medición.' : 'Sin posiciones GPS recientes. Ubicaciones estimadas según horarios oficiales; pueden variar por retrasos, cancelaciones y tráfico.',
    };
  }
}

export function officialTransitService() {
  const url = process.env.TRANSIT_FEED_URL;
  let external: FeedService | undefined;
  return new TransitService(undefined, undefined, url ? { get: async () => {
    try { external ??= new FeedService(url); return await external.get(); }
    catch { return { mode: 'live', status: 'unavailable', data: null, message: 'Fuente GPS no disponible.' }; }
  } } : undefined);
}
