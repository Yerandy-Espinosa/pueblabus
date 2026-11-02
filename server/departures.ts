import { z } from 'zod';
import { journeysFor, madridMinutes, serviceDate, timeMinutes, type DepartureBoard, type Snapshot } from '../src/transit.ts';
import { scheduledSnapshot } from './scheduled.ts';
import { madridTimestamp } from './ctas-gps.ts';

const responseSchema = z.object({ servicios: z.array(z.object({
  idParada: z.coerce.string(), idLinea: z.coerce.string(), servicio: z.string().regex(/^\d{2}:[0-5]\d$/),
  nombre: z.string(), linea: z.string(), sentido: z.coerce.string(), destino: z.string(), tipo: z.coerce.string(),
})), horaIni: z.string(), horaFin: z.string() });

export class CtanDeparturesSource {
  private cache = new Map<string, { at: number; board: DepartureBoard }>();
  private pending = new Map<string, Promise<DepartureBoard>>();
  constructor(private load: () => Promise<Snapshot> = scheduledSnapshot, private request: typeof fetch = fetch) {}

  async get(stopId: string, now = new Date()): Promise<DepartureBoard> {
    if (!/^ctan:1_\d+$/.test(stopId)) throw new Error('invalid_stop');
    const cached = this.cache.get(stopId);
    if (cached && now.getTime() - cached.at < 30_000) return cached.board;
    if (this.pending.has(stopId)) return this.pending.get(stopId)!;
    const task = this.refresh(stopId, now);
    this.pending.set(stopId, task);
    try {
      const board = await task;
      this.cache.set(stopId, { at: now.getTime(), board });
      return board;
    } finally { this.pending.delete(stopId); }
  }

  private async refresh(stopId: string, now: Date): Promise<DepartureBoard> {
    const snapshot = await this.load();
    if (!snapshot.data?.stops.some(s => s.id === stopId)) throw new Error('unknown_stop');
    const lineIds = new Set(snapshot.data.routes.map(r => r.ctanLineId || /^ctan:1_(\d+):/.exec(r.id)?.[1]).filter(Boolean));
    const url = new URL(`https://api.ctan.es/v1/Consorcios/1/paradas/${stopId.slice(7)}/servicios`);
    const date = serviceDate(now), minute = Math.floor(madridMinutes(now));
    const start = `${date} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    let cursor = start;
    const departures: DepartureBoard['departures'] = [];
    const expectedBetween = (until: string): DepartureBoard['departures'] => {
      const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return [date, tomorrow.toISOString().slice(0, 10)].flatMap(day => snapshot.data!.routes.flatMap(route => {
        if (route.stopIds.at(-1) === stopId) return [];
        return journeysFor(snapshot.data!, route.id, day).flatMap(j => j.stopTimes.filter(s => s.stopId === stopId).flatMap(s => {
          const instant = madridTimestamp(day, s.time.slice(0, 5));
          if (instant === null || instant < now.getTime() - 60_000 || `${day} ${s.time.slice(0, 5)}` > until) return [];
          return [{ id: `${route.ctanLineId}:${route.ctanDirection}:${day}:${s.time.slice(0, 5)}`, line: route.shortName, destination: route.destination,
            time: s.time.slice(0, 5), date: day, inMinutes: Math.max(0, Math.ceil((instant - now.getTime()) / 60_000)), boarding: true, scheduled: true as const }];
        }));
      })).sort((a, b) => a.inMinutes - b.inMinutes);
    };
    const unavailable = (): DepartureBoard => ({ stopId, status: 'unavailable', checkedAt: now.toISOString(), from: start, until: cursor, departures: [], message: 'No se ha podido consultar CTAN. Los horarios guardados siguen disponibles debajo.' });
    try {
      const deadline = AbortSignal.timeout(8_000);
      for (let window = 0; window < 3; window++) {
        const [day, clock] = cursor.split(' ');
        const [year, month, dateOfMonth] = day.split('-');
        url.search = new URLSearchParams({ horaIni: `${dateOfMonth}-${month}-${year} ${clock}` }).toString();
        const response = await this.request(url, { signal: deadline });
        if (!response.ok) return unavailable();
        const data = responseSchema.parse(await response.json());
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(data.horaFin) || data.horaFin <= cursor) return unavailable();
        for (const item of data.servicios) {
          if (!lineIds.has(item.idLinea) || item.idParada !== stopId.slice(7)) continue;
          let departureDate = day;
          if (timeMinutes(item.servicio) < timeMinutes(clock)) {
            const tomorrow = new Date(`${day}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            departureDate = tomorrow.toISOString().slice(0, 10);
          }
          const instant = madridTimestamp(departureDate, item.servicio);
          if (instant === null || instant < now.getTime() - 60_000) continue;
          const activeRoutes = snapshot.data!.routes.filter(r => r.ctanLineId === item.idLinea && r.ctanDirection === item.sentido && r.stopIds.at(-1) !== stopId && journeysFor(snapshot.data!, r.id, departureDate).length);
          if (!activeRoutes.length) continue;
          if (snapshot.data!.holidays?.includes(departureDate) && !expectedBetween(data.horaFin).some(d => d.time === item.servicio && d.date === departureDate && d.line === activeRoutes[0].shortName)) continue;
          const id = `${item.idLinea}:${item.sentido}:${departureDate}:${item.servicio}`;
          if (!departures.some(d => d.id === id)) departures.push({ id, line: item.nombre.match(/M-\d+[A-Z]?/)?.[0] || item.linea,
            destination: item.destino, time: item.servicio, date: departureDate, inMinutes: Math.max(0, Math.ceil((instant - now.getTime()) / 60_000)),
            boarding: item.tipo !== '2', scheduled: true });
        }
        cursor = data.horaFin.slice(0, 16);
        if (departures.length || expectedBetween(cursor).length) break;
      }
      const holiday = snapshot.data!.holidays?.includes(date);
      const expected = expectedBetween(cursor);
      return { stopId, status: 'ok', checkedAt: now.toISOString(), from: start, until: cursor, departures: holiday || !departures.length ? expected : departures,
        sourceLabel: holiday ? 'Calendario oficial de festivos' : departures.length ? 'Consulta CTAN' : 'GTFS oficial',
        message: holiday ? 'Se aplica el calendario de festivos del GTFS oficial, excluyendo variantes laborables.' : 'Horas programadas consultadas en CTAN. No son predicciones GPS.' };
    } catch { return unavailable(); }
  }
}

export const departuresSource = new CtanDeparturesSource();

export async function departuresResponse(request: Request, source = departuresSource): Promise<Response> {
  const stopId = new URL(request.url).searchParams.get('stopId') || '';
  try {
    const board = await source.get(stopId);
    return Response.json(board, { status: board.status === 'unavailable' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof Error && error.message === 'invalid_stop';
    return Response.json({ message: invalid ? 'Identificador de parada no válido.' : 'Parada no disponible en este recorrido.' }, { status: invalid ? 400 : 404 });
  }
}
