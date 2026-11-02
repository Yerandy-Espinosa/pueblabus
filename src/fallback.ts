import { mergeEstimates } from './estimates';
import type { Snapshot } from './transit';

// Continue estimating from the last official timetable while this open page is
// offline. A computed position is never relabelled as a GPS measurement.
export function displaySnapshot(raw: Snapshot | null, now: Date, offline = false): Snapshot | null {
  if (!raw?.data?.journeys || !['estimated', 'live', 'mixed'].includes(raw.mode)) return raw;
  const gps = offline ? [] : raw.data.vehicles.filter(v => v.positionSource !== 'estimate' && now.getTime() - Date.parse(v.updatedAt) <= 60_000 && now.getTime() >= Date.parse(v.updatedAt) - 30_000);
  if (raw.mode === 'live' && !offline && gps.length === raw.data.vehicles.length) return raw;
  const vehicles = mergeEstimates(raw.data, gps, now);
  const hasEstimate = vehicles.some(v => v.positionSource === 'estimate');
  return { ...raw, mode: gps.length ? hasEstimate ? 'mixed' : 'live' : 'estimated',
    status: offline ? 'stale' : raw.status,
    data: { ...raw.data, vehicles, updatedAt: now.toISOString() },
    gps: { status: offline ? 'unavailable' : gps.length ? 'connected' : raw.gps?.status === 'connected' ? 'stale' : raw.gps?.status || 'unavailable', checkedAt: raw.gps?.checkedAt || raw.data.updatedAt, source: raw.gps?.source },
    message: offline ? 'Sin conexión. Ubicaciones estimadas en este dispositivo con el último horario recibido; no son posiciones GPS.' : gps.length ? raw.message : 'Sin posiciones GPS recientes. Ubicaciones estimadas según horarios oficiales; pueden variar por tráfico, retrasos y cancelaciones.',
  };
}
