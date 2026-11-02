import { describe, expect, it, vi } from 'vitest';
import { testFeed, testGps, testNow } from './fixtures/transit';
import { estimateVehicles } from '../src/estimates';
import { displaySnapshot } from '../src/fallback';
import { TransitService } from '../server/transit-service';
import { CtasGpsSource, decodeCoordinate, madridTimestamp } from '../server/ctas-gps';
import { journeysFor, type Snapshot } from '../src/transit';

describe('estimaciones sobre horarios reales', () => {
  it('interpela sobre el trazado entre paradas y deja de mostrar el viaje al terminar', () => {
    const feed = testFeed();
    const first = estimateVehicles(feed, testNow);
    expect(first).toHaveLength(2);
    expect(first[0].position[0]).toBeCloseTo(37.025, 5);
    expect(first[0].position[1]).toBeCloseTo(-6, 5);
    expect(first[0]).toMatchObject({ positionSource: 'estimate', nextStopId: 'ctan:1_101', arrivalMinutes: 15 });
    expect(estimateVehicles(feed, new Date('2026-11-02T10:01:00Z'))).toEqual([]);
    expect(estimateVehicles(feed, new Date('2027-01-01T09:15:00Z'))).toEqual([]);
  });
  it('mantiene los servicios del día anterior que cruzan medianoche', () => {
    const feed = testFeed();
    feed.calendar![0].days = [true, false, false, false, false, false, false];
    feed.journeys = [{ ...feed.journeys![0], departure: '23:30:00', arrival: '24:30:00', stopTimes: feed.routes[0].stopIds.map((stopId, i) => ({ stopId, time: ['23:30:00', '24:00:00', '24:30:00'][i] })) }];
    const positions = estimateVehicles(feed, new Date('2026-11-02T23:10:00Z'));
    expect(positions).toHaveLength(1);
    expect(positions[0].id).toContain('2026-11-02');
    expect(positions[0].arrivalMinutes).toBe(20);
  });
  it('excluye M-141 en sábados, domingos y festivos y usa el patrón festivo de M-140', () => {
    const feed = testFeed();
    feed.holidays = ['2026-11-02'];
    feed.routes[0] = { ...feed.routes[0], shortName: 'M-141', operatesOnWeekends: false, operatesOnHolidays: false };
    feed.routes[1] = { ...feed.routes[1], shortName: 'M-140' };
    expect(journeysFor(feed, feed.routes[0].id, '2026-11-02')).toEqual([]);
    expect(journeysFor(feed, feed.routes[0].id, '2026-11-07')).toEqual([]);
    expect(journeysFor(feed, feed.routes[0].id, '2026-11-08')).toEqual([]);
    expect(journeysFor(feed, feed.routes[0].id, '2026-11-03')).toHaveLength(1);
    expect(estimateVehicles(feed, testNow).map(v => v.routeId)).toEqual([feed.routes[1].id]);
  });
});

describe('GPS primero, estimación identificada al fallar', () => {
  it('da prioridad al GPS, evita duplicarlo y estima solo el sentido que no tiene GPS', async () => {
    const feed = testFeed();
    const load = async (): Promise<Snapshot> => ({ mode: 'scheduled', status: 'ok', message: '', data: feed });
    let connected = true;
    const gps = { get: async () => ({ vehicles: connected ? [testGps(feed)] : [], status: connected ? 'connected' as const : 'unavailable' as const, source: 'https://www.ctas.es/busInfoLinea.php' }) };
    const service = new TransitService(load, gps, undefined, () => testNow);
    expect(await service.get()).toMatchObject({ mode: 'mixed', data: { vehicles: [{ positionSource: 'gps' }, { positionSource: 'estimate', routeId: feed.routes[1].id }] } });
    connected = false;
    const fallback = await service.get();
    expect(fallback.mode).toBe('estimated');
    expect(fallback.data!.vehicles.every(v => v.positionSource === 'estimate')).toBe(true);
    connected = true;
    expect((await service.get()).data!.vehicles[0].positionSource).toBe('gps');
  });
  it('no inventa datos si faltan tanto GPS como horario, y no interpreta una fuente vacía como GPS', async () => {
    const feed = testFeed();
    const source = { get: async (): Promise<Snapshot> => ({ mode: 'live', status: 'ok', message: '', data: { ...feed, vehicles: [] } }) };
    const service = new TransitService(async () => ({ mode: 'scheduled', status: 'ok', message: '', data: feed }), undefined, source, () => testNow);
    expect((await service.get()).mode).toBe('estimated');
    const empty = new TransitService(async () => ({ mode: 'scheduled', status: 'unavailable', message: '', data: null }), undefined, source, () => testNow);
    expect((await empty.get()).data).toBeNull();
  });
  it('si el navegador pierde conexión utiliza el horario recibido sin etiquetar la estimación como GPS', () => {
    const feed = testFeed();
    const raw: Snapshot = { mode: 'live', status: 'ok', message: '', data: { ...feed, vehicles: [testGps(feed)] } };
    expect(displaySnapshot(raw, testNow, false)?.mode).toBe('live');
    const offline = displaySnapshot(raw, testNow, true)!;
    expect(offline.mode).toBe('estimated');
    expect(offline.status).toBe('stale');
    expect(offline.data!.vehicles.every(v => v.positionSource === 'estimate')).toBe(true);
    expect(displaySnapshot(raw, new Date(testNow.getTime() + 61_000), false)?.mode).toBe('estimated');
  });
});

describe('protocolo público de posicionamiento CTAS', () => {
  it('decodifica coordenadas decimales y grados/minutos/segundos sin aceptar valores inválidos', () => {
    expect(decodeCoordinate('+370300.00', true)).toBeCloseTo(37.05);
    expect(decodeCoordinate('-0060000.00', false)).toBe(-6);
    expect(decodeCoordinate('37.05', true)).toBe(37.05);
    expect(decodeCoordinate('N371549.630', true)).toBeCloseTo(37.2637861111, 7);
    expect(decodeCoordinate('W0060402.180', false)).toBeCloseTo(-6.0672722222, 7);
    expect(decodeCoordinate('+376100.0', true)).toBeNull();
    expect(decodeCoordinate('not-a-coordinate', false)).toBeNull();
  });
  it('convierte la hora de medición peninsular en invierno/verano y rechaza horas inexistentes', () => {
    expect(madridTimestamp('02/11/2026', '10:15:00')).toBe(testNow.getTime());
    expect(madridTimestamp(' 2026-11-02', ' 10:15:00')).toBe(testNow.getTime());
    expect(madridTimestamp('2026-07-02', '10:15')).toBe(Date.parse('2026-07-02T08:15:00Z'));
    expect(madridTimestamp('2026-03-29', '02:30')).toBeNull();
    expect(madridTimestamp('invalid', '10:15')).toBeNull();
  });
  it('elige la medición más reciente, rechaza posiciones antiguas y respeta la caché de 30 segundos', async () => {
    const feed = testFeed();
    const request = vi.fn(async (url: URL | RequestInfo) => Response.json({ E: 0, posicion: String(url).includes('sentido=1') ? [
      { idtpc: '42', latitud: 'N370300.00', longitud: 'W0060000.00', fecha: ' 2026-11-02', hora: ' 10:14:50' },
      { idtpc: '42', latitud: '+370100.00', longitud: '-0060000.00', fecha: '02/11/2026', hora: '10:14:10' },
      { idtpc: 'OLD', latitud: '+370100.00', longitud: '-0060000.00', fecha: '02/11/2026', hora: '09:00:00' },
    ] : [] }));
    const source = new CtasGpsSource(request);
    const result = await source.get(feed, testNow);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]).toMatchObject({ id: 'ctas:42', positionSource: 'gps', position: [37.05, -6], etaAvailable: false });
    await source.get(feed, new Date(testNow.getTime() + 5_000));
    expect(request).toHaveBeenCalledTimes(2);
    expect((await source.get(feed, new Date(testNow.getTime() + 61_000))).vehicles).toEqual([]);
  });
});
