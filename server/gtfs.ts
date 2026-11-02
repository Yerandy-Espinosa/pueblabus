import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'csv-parse/sync';
import { feedSchema } from '../src/schema.ts';
import { normalize, timeMinutes, type Feed, type Point } from '../src/transit.ts';

export const CTAN_GTFS_URL = 'https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip';
type Row = Record<string, string>;
const isoDate = (d: string) => {
  if (!/^\d{8}$/.test(d)) throw new Error('Fecha GTFS no válida');
  const result = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (new Date(`${result}T12:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error('Fecha GTFS no válida');
  return result;
};

// Import ONLY official static data. GTFS schedules never create vehicle positions.
export function importGtfs(bytes: Uint8Array, now = new Date()): Feed {
  const zip = unzipSync(bytes, { filter: file => /(?:^|\/)(?:agency|routes|stops|trips|stop_times|calendar|calendar_dates|shapes|feed_info)\.txt$/.test(file.name) && file.originalSize <= 250_000_000 });
  const rows = (name: string, required = true): Row[] => {
    const key = Object.keys(zip).find(k => k === name || k.endsWith(`/${name}`));
    if (!key) { if (required) throw new Error(`Falta ${name} en el GTFS`); return []; }
    // CTAN contains literal, unescaped quotes in some stop names. csv-parse's
    // trim + relax_quotes combination still throws after a closing quote.
    // Preserve literal quotes and trim decoded cells instead; keep column counts
    // strict so malformed CSV cannot shift names into coordinate columns.
    return parse(strFromU8(zip[key]), {
      columns: true, bom: true, skip_empty_lines: true, max_record_size: 100_000,
      relax_quotes: true, cast: (value: string) => value.trim(),
    });
  };
  const agencies = new Map(rows('agency.txt').map(a => [a.agency_id, a]));
  const lines = rows('routes.txt').filter(r => {
    const agency = agencies.get(r.agency_id);
    const seville = /sevilla|ctmas|ctas/.test(normalize(`${r.agency_id} ${agency?.agency_name || ''}`));
    return seville && normalize(`${r.route_long_name} ${r.route_desc || ''}`).includes('isla mayor');
  });
  if (!lines.length) throw new Error('El feed no contiene una línea de Isla Mayor en el consorcio de Sevilla. No se publican datos inventados.');
  const lineMap = new Map(lines.map(r => [r.route_id, r]));
  const trips = rows('trips.txt').filter(t => lineMap.has(t.route_id));
  const tripIds = new Set(trips.map(t => t.trip_id));
  const times = new Map<string, Row[]>();
  for (const time of rows('stop_times.txt')) {
    if (!tripIds.has(time.trip_id)) continue;
    const list = times.get(time.trip_id) || [];
    list.push(time); times.set(time.trip_id, list);
  }
  const rawStops = new Map(rows('stops.txt').map(s => [s.stop_id, s]));
  const rawShapes = new Map<string, Row[]>();
  const shapeIds = new Set(trips.map(t => t.shape_id).filter(Boolean));
  if (shapeIds.size) for (const point of rows('shapes.txt', false)) {
    if (!shapeIds.has(point.shape_id)) continue;
    const list = rawShapes.get(point.shape_id) || [];
    list.push(point); rawShapes.set(point.shape_id, list);
  }
  const stops = new Map<string, Feed['stops'][number]>();
  const routes: Feed['routes'] = [];
  const journeys: NonNullable<Feed['journeys']> = [];
  const patterns = new Map<string, string>();
  for (const trip of trips) {
    const ordered = (times.get(trip.trip_id) || []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (ordered.length < 2) throw new Error('Viaje GTFS sin secuencia de paradas completa');
    const schedule = ordered.map(t => {
      const raw = rawStops.get(t.stop_id);
      if (!raw || !raw.stop_lat?.trim() || !raw.stop_lon?.trim()) throw new Error('Parada sin coordenadas publicadas');
      const position: Point = [Number(raw.stop_lat), Number(raw.stop_lon)];
      if (!position.every(Number.isFinite) || position[0] < 35 || position[0] > 39 || position[1] < -8 || position[1] > -1) throw new Error('Coordenadas de parada no válidas para Andalucía');
      const id = `ctan:${t.stop_id}`;
      stops.set(id, { id, name: raw.stop_name, town: 'Área de Sevilla', position, minutesFromStart: 0 });
      const time = t.departure_time || t.arrival_time;
      if (!/^\d{2,3}:[0-5]\d:[0-5]\d$/.test(time || '')) throw new Error('Hora de paso GTFS no publicada o no válida');
      return { stopId: id, time };
    });
    const departure = schedule[0].time;
    const arrival = ordered.at(-1)!.arrival_time || schedule.at(-1)!.time;
    const duration = timeMinutes(arrival) - timeMinutes(departure);
    if (duration <= 0 || schedule.some((s, i) => i > 0 && timeMinutes(s.time) < timeMinutes(schedule[i - 1].time))) throw new Error('Secuencia horaria GTFS no válida');
    const key = JSON.stringify([trip.route_id, trip.direction_id, schedule.map(s => s.stopId)]);
    let routeId = patterns.get(key);
    if (!routeId) {
      routeId = `ctan:${trip.route_id}:${routes.length + 1}`;
      patterns.set(key, routeId);
      const line = lineMap.get(trip.route_id)!;
      const shapeRows = (rawShapes.get(trip.shape_id) || []).sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence));
      const geometry = shapeRows.length >= 2 ? 'shape' : 'stops';
      const shape: Point[] = geometry === 'shape' ? shapeRows.map(p => [Number(p.shape_pt_lat), Number(p.shape_pt_lon)]) : schedule.map(s => stops.get(s.stopId)!.position);
      routes.push({
        id: routeId, shortName: line.route_short_name || line.route_id,
        name: `${stops.get(schedule[0].stopId)!.name} → ${stops.get(schedule.at(-1)!.stopId)!.name}`,
        destination: trip.trip_headsign || stops.get(schedule.at(-1)!.stopId)!.name,
        color: /^([a-fA-F0-9]{6})$/.test(line.route_color || '') ? `#${line.route_color}` : trip.direction_id === '1' ? '#c78942' : '#21796a',
        stopIds: schedule.map(s => s.stopId), shape, geometry, durationMinutes: Math.ceil(duration),
        // An agency/consortium is not necessarily the operating company.
        operator: agencies.get(line.agency_id)?.agency_name || '',
      });
    }
    journeys.push({ id: trip.trip_id, routeId, serviceId: trip.service_id, departure, arrival, stopTimes: schedule });
  }
  if (!journeys.length) throw new Error('No hay viajes de Isla Mayor en el GTFS');
  const serviceIds = new Set(journeys.map(j => j.serviceId));
  const calendar = rows('calendar.txt', false).filter(c => serviceIds.has(c.service_id)).map(c => ({ id: c.service_id, start: isoDate(c.start_date), end: isoDate(c.end_date), days: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => c[d] === '1') }));
  const exceptions = rows('calendar_dates.txt', false).filter(c => serviceIds.has(c.service_id)).map(c => {
    if (!['1', '2'].includes(c.exception_type)) throw new Error('Excepción GTFS no válida');
    return { serviceId: c.service_id, date: isoDate(c.date), added: c.exception_type === '1' };
  });
  if (!calendar.length && !exceptions.length) throw new Error('No hay calendario de servicio publicado');
  const validUntil = [...calendar.map(c => c.end), ...exceptions.filter(e => e.added).map(e => e.date)].sort().at(-1);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  if (!validUntil || validUntil < today) throw new Error('El calendario GTFS ha caducado');
  return feedSchema.parse({ updatedAt: now.toISOString(), routes, stops: [...stops.values()], vehicles: [], timetables: [], journeys, calendar, exceptions,
    source: { url: CTAN_GTFS_URL, fetchedAt: now.toISOString(), name: 'Red de Consorcios de Transporte de Andalucía · GTFS', validUntil } });
}
