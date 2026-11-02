import { afterEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importGtfs } from '../server/gtfs';
import { departuresFor, displayTime, journeysFor } from '../src/transit';
import { scheduledSnapshot } from '../server/scheduled';

// Synthetic GTFS fixture. Never shipped as operator data.
function fixture(overrides: Record<string, string> = {}) {
  const files = {
    'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nCTMAS,Consorcio de Sevilla,https://www.ctas.es,Europe/Madrid\n',
    'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,CTMAS,TEST,Sevilla - Isla Mayor,3\nR2,CTMAS,OTHER,Sevilla - Otro municipio,3\n',
    'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Isla Mayor,37.133,-6.16\nB,"Parada, intermedia",37.28,-6.05\nC,Sevilla,37.39,-6.00\n',
    'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\nR1,WORK,T1,Sevilla,0\nR1,EXTRA,T2,Sevilla,0\nR2,WORK,OTHER,Otro municipio,0\n',
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,23:40:00,23:40:00,A,1\nT1,24:10:00,24:12:00,B,2\nT1,24:55:00,24:55:00,C,3\nT2,08:00:00,08:00:00,A,1\nT2,08:30:00,08:32:00,B,2\nT2,09:00:00,09:00:00,C,3\n',
    'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWORK,1,1,1,1,1,0,0,20260101,20261231\n',
    'calendar_dates.txt': 'service_id,date,exception_type\nWORK,20261103,2\nEXTRA,20261108,1\n',
    ...overrides,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)])));
}

const now = new Date('2026-11-02T12:00:00Z');
const tempDirs: string[] = [];
afterEach(async () => { for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true }); });

describe('importación de horarios GTFS', () => {
  it('filtra Isla Mayor, mantiene las paradas CSV y no inventa vehículos ni trazado', () => {
    const data = importGtfs(fixture(), now);
    expect(data.routes).toHaveLength(1);
    expect(data.routes[0].shortName).toBe('TEST');
    expect(data.routes[0].geometry).toBe('stops');
    expect(data.stops[1].name).toBe('Parada, intermedia');
    expect(data.vehicles).toEqual([]);
    expect(data.source?.validUntil).toBe('2026-12-31');
  });
  it('respeta los festivos, las excepciones, los límites de calendario y las horas tras medianoche', () => {
    const data = importGtfs(fixture(), now);
    const route = data.routes[0].id;
    expect(departuresFor(data, route, '2026-11-02')).toEqual(['23:40:00']);
    expect(departuresFor(data, route, '2026-11-03')).toEqual([]);
    expect(departuresFor(data, route, '2026-11-08')).toEqual(['08:00:00']);
    expect(departuresFor(data, route, '2027-01-04')).toEqual([]);
    expect(journeysFor(data, route, '2026-11-02')[0].stopTimes[1].time).toBe('24:12:00');
    expect(displayTime('24:55:00')).toBe('00:55 (+1)');
  });
  it('acepta nombres con comillas literales sin desplazar las coordenadas', () => {
    const data = importGtfs(fixture({
      'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA, Isla Mayor , 37.133 , -6.16 \nB,"Parada" Centro,37.28,-6.05\nC,"Sevilla, ""Plaza de Armas""",37.39,-6.00\n',
    }), now);
    expect(data.stops.map(s => s.name)).toEqual(['Isla Mayor', '"Parada" Centro', 'Sevilla, "Plaza de Armas"']);
    expect(data.stops[1].position).toEqual([37.28, -6.05]);
    expect(data.stops[2].position).toEqual([37.39, -6]);
  });
  it('sigue rechazando registros con columnas desplazadas en vez de omitir paradas', () => {
    expect(() => importGtfs(fixture({
      'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Isla Mayor,37.133,-6.16\nB,Parada, Centro,37.28,-6.05\nC,Sevilla,37.39,-6.00\n',
    }), now)).toThrow();
  });
  it('aplica el festivo publicado sin mantener simultáneamente el patrón laborable', () => {
    const data = importGtfs(fixture({
      'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\nR1,1_TEST_1,T1,Sevilla,0\nR1,1_TEST_3,T2,Sevilla,0\n',
      'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n1_TEST_1,1,1,1,1,1,0,0,20260101,20261231\n1_TEST_3,0,0,0,0,0,0,1,20260101,20261231\n',
      'calendar_dates.txt': 'service_id,date,exception_type\n1_TEST_3,20261102,1\n',
    }), now);
    expect(data.holidays).toEqual(['2026-11-02']);
    expect(departuresFor(data, data.routes[0].id, '2026-11-02')).toEqual(['08:00:00']);
    expect(departuresFor(data, data.routes[0].id, '2026-11-03')).toEqual(['23:40:00']);
  });
  it('conserva la geometría publicada cuando está disponible', () => {
    const data = importGtfs(fixture({
      'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nR1,WORK,T1,Sevilla,0,S1\n',
      'shapes.txt': 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,37.13,-6.16,1\nS1,37.2,-6.12,2\nS1,37.39,-6,3\n',
    }), now);
    expect(data.routes[0].geometry).toBe('shape');
    expect(data.routes[0].shape[1]).toEqual([37.2, -6.12]);
  });
  it('rechaza feeds ajenos al corredor, incompletos, caducados o con coordenadas inválidas', () => {
    expect(() => importGtfs(fixture({ 'routes.txt': 'route_id,agency_id,route_short_name,route_long_name\nX,CTMAS,TEST,Otro municipio\n' }), now)).toThrow('Isla Mayor');
    expect(() => importGtfs(fixture({ 'calendar.txt': '', 'calendar_dates.txt': '' }), now)).toThrow('calendario');
    expect(() => importGtfs(fixture(), new Date('2027-01-01T12:00:00Z'))).toThrow('caducado');
    expect(() => importGtfs(fixture({ 'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Isla Mayor,0,0\n' }), now)).toThrow('Coordenadas');
  });
  it('distingue el horario oficial del GPS y avisa si la instantánea está desactualizada', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pueblabus-gtfs-test-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'ctan.json');
    expect(await scheduledSnapshot(file, now)).toMatchObject({ mode: 'scheduled', status: 'unavailable', data: null });
    await writeFile(file, JSON.stringify(importGtfs(fixture(), now)));
    expect(await scheduledSnapshot(file, now)).toMatchObject({ mode: 'scheduled', status: 'ok', data: { vehicles: [] } });
    expect(await scheduledSnapshot(file, new Date('2026-11-10T12:00:00Z'))).toMatchObject({ status: 'stale' });
    expect(await scheduledSnapshot(file, new Date('2027-01-01T12:00:00Z'))).toMatchObject({ status: 'stale', message: expect.stringContaining('caducado') });
  });
});
