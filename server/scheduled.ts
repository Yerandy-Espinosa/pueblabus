import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { feedSchema } from '../src/schema.ts';
import { serviceDate, type Feed, type Snapshot } from '../src/transit.ts';

export async function scheduledSnapshot(file = path.resolve('data/ctan.json'), now = new Date()): Promise<Snapshot> {
  try {
    const data: Feed = feedSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    if (!data.journeys || !data.source || data.vehicles.length) throw new Error('Invalid scheduled snapshot');
    const expired = !!data.source.validUntil && data.source.validUntil < serviceDate(now);
    const old = now.getTime() - Date.parse(data.source.fetchedAt) > 7 * 86_400_000;
    return { mode: 'scheduled', status: expired || old ? 'stale' : 'ok', data,
      message: expired ? 'El calendario publicado ha caducado. Consulta al operador antes de viajar.' : old ? 'Horarios importados hace más de siete días. Conviene actualizar la fuente antes de viajar.' : 'Horarios y paradas del GTFS de CTAN. Posiciones GPS no disponibles; el trazado puede unir paradas cuando la fuente no publica geometría.' };
  } catch {
    return { mode: 'scheduled', status: 'unavailable', data: null, message: 'No se han podido cargar los horarios oficiales. No se muestran horarios ni autobuses inventados.' };
  }
}
