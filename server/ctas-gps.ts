import { z } from 'zod';
import { journeysFor, serviceDate, type Feed, type Point, type Route, type Vehicle } from '../src/transit.ts';
import { estimateVehicles } from '../src/estimates.ts';

export const CTAS_GPS_URL = 'https://www.ctas.es/busInfoLinea.php';
const envelope = z.object({ E: z.coerce.number(), posicion: z.array(z.record(z.string(), z.unknown())).optional() });
export type GpsResult = { vehicles: Vehicle[]; status: 'connected' | 'unavailable' | 'stale'; source: string };

export function decodeCoordinate(raw: unknown, latitude: boolean): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const text = String(raw).trim().toUpperCase();
  const limit = latitude ? 90 : 180;
  const decimal = Number(text);
  if (text && Number.isFinite(decimal) && Math.abs(decimal) <= limit) return decimal;
  // Format used by CTAS' public posicionamiento.js: sign, degrees, minutes, seconds.
  const match = new RegExp(`^([${latitude ? '+NS-' : '+EW-'}])(\\d{${latitude ? 2 : 3}})(\\d{2})(\\d{2}(?:\\.\\d+)?)$`).exec(text);
  if (!match) return null;
  const minutes = Number(match[3]), seconds = Number(match[4]);
  const result = (Number(match[2]) + minutes / 60 + seconds / 3600) * (['-', 'S', 'W'].includes(match[1]) ? -1 : 1);
  return minutes < 60 && seconds < 60 && Math.abs(result) <= limit ? result : null;
}

export function madridTimestamp(date: unknown, time: unknown): number | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  const dateText = date.trim(), timeText = time.trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(dateText);
    if (!match) return null;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  }
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText);
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] || 0) > 59) return null;
  const wall = Date.UTC(year!, month! - 1, day!, Number(clock[1]), Number(clock[2]), Number(clock[3] || 0));
  let instant = wall;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(instant);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const displayed = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    instant += wall - displayed;
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return get('year') === year! && get('month') === month! && get('day') === day! && get('hour') === Number(clock[1]) ? instant : null;
}

function nextStop(feed: Feed, route: Route, position: Point) {
  const stops = route.stopIds.map(id => feed.stops.find(s => s.id === id)!).filter(Boolean);
  let nearest = 0, best = Infinity;
  stops.forEach((s, i) => {
    const d = Math.hypot(s.position[0] - position[0], (s.position[1] - position[1]) * Math.cos(position[0] * Math.PI / 180));
    if (d < best) { best = d; nearest = i; }
  });
  // GPS does not supply an ETA or next-stop event: do not infer a measured arrival.
  return stops[nearest]?.id;
}

export class CtasGpsSource {
  private fetchedAt = 0;
  private payloads: { routeId: string; value: unknown }[] = [];
  private pending: Promise<void> | null = null;
  constructor(private request: typeof fetch = fetch) {}

  async get(feed: Feed, now = new Date()): Promise<GpsResult> {
    if (now.getTime() - this.fetchedAt >= 30_000 || !this.fetchedAt) {
      this.pending ??= this.refresh(feed, now);
      try { await this.pending; } finally { this.pending = null; }
    }
    const newest = new Map<string, Vehicle>();
    let sawOld = false;
    for (const payload of this.payloads) {
      const route = feed.routes.find(r => r.id === payload.routeId);
      const parsed = envelope.safeParse(payload.value);
      if (!route || !parsed.success || parsed.data.E !== 0) continue;
      for (const raw of parsed.data.posicion || []) {
        const measured = madridTimestamp(raw.fecha, raw.hora);
        if (measured === null) continue;
        const age = now.getTime() - measured;
        if (age > 60_000 || age < -30_000) { sawOld = true; continue; }
        const lat = decodeCoordinate(raw.latitud, true), lon = decodeCoordinate(raw.longitud, false);
        if (lat === null || lon === null || lat < 35 || lat > 39 || lon < -8 || lon > -1 || !raw.idtpc) continue;
        const id = `ctas:${String(raw.idtpc)}`;
        const position: Point = [lat, lon];
        const stop = nextStop(feed, route, position);
        if (!stop) continue;
        const candidate: Vehicle = { id, label: `Bus ${String(raw.idtpc)}`, routeId: route.id, position, nextStopId: stop,
          arrivalMinutes: 0, updatedAt: new Date(measured).toISOString(), positionSource: 'gps', etaAvailable: false, nextStopKnown: false };
        if (!newest.has(id) || Date.parse(newest.get(id)!.updatedAt) < measured) newest.set(id, candidate);
      }
    }
    return { vehicles: [...newest.values()], status: newest.size ? 'connected' : sawOld ? 'stale' : 'unavailable', source: CTAS_GPS_URL };
  }

  private async refresh(feed: Feed, now: Date) {
    const active = new Set(estimateVehicles(feed, now).map(v => v.routeId));
    const routes = feed.routes.filter(r => r.ctanLineId && r.ctanDirection && (active.has(r.id) || journeysFor(feed, r.id, serviceDate(now)).length > 0));
    const unique = routes.filter((r, i) => routes.findIndex(other => other.ctanLineId === r.ctanLineId && other.ctanDirection === r.ctanDirection) === i);
    const results = await Promise.allSettled(unique.map(async route => {
      const url = new URL(CTAS_GPS_URL);
      url.search = new URLSearchParams({ idlinea: route.ctanLineId!, sentido: route.ctanDirection!, accion: 'infoLinea' }).toString();
      const response = await this.request(url, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error('CTAS GPS unavailable');
      return { routeId: route.id, value: await response.json() as unknown };
    }));
    this.payloads = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    this.fetchedAt = now.getTime();
  }
}
