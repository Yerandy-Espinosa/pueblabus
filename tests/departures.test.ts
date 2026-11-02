import { describe, expect, it, vi } from 'vitest';
import { CtanDeparturesSource, departuresResponse } from '../server/departures';
import { enrichCtanMetadata } from '../server/ctan-metadata';
import { testFeed, testNow } from './fixtures/transit';
import type { Snapshot } from '../src/transit';

describe('consulta oficial de salidas por parada', () => {
  const response = (servicios: unknown[]) => Response.json({ servicios, horaIni: '2026-11-02 10:15', horaFin: '2026-11-02 11:15' });
  const item = { idParada: '100', idLinea: '324', servicio: '10:30', nombre: 'M-143 Test', linea: '1431', sentido: '1', destino: 'SEVILLA', tipo: '0' };
  it('filtra otras líneas y conserva la distinción entre hora programada y GPS', async () => {
    const feed = testFeed();
    const fetch = vi.fn(async () => response([item, { ...item, idLinea: '999' }]));
    const source = new CtanDeparturesSource(async () => ({ mode: 'scheduled', status: 'ok', data: feed, message: '' }), fetch);
    const board = await source.get('ctan:1_100', testNow);
    expect(board.status).toBe('ok');
    expect(board.departures).toHaveLength(1);
    expect(board.departures[0]).toMatchObject({ time: '10:30', inMinutes: 15, scheduled: true });
    await source.get('ctan:1_100', new Date(testNow.getTime() + 5000));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('excluye M-141 y horarios laborables contradictorios durante el festivo', async () => {
    const feed = testFeed();
    const base = feed.routes[0];
    feed.holidays = ['2026-11-02'];
    feed.routes = [{ ...base, id: 'weekday-only', shortName: 'M-141', ctanLineId: '300', operatesOnHolidays: false, operatesOnWeekends: false }, { ...base, id: 'holiday', shortName: 'M-140', ctanLineId: '299' }];
    feed.journeys = feed.routes.map(r => ({ id: r.id, routeId: r.id, serviceId: 'test-daily', departure: '10:30:00', arrival: '11:30:00', stopTimes: r.stopIds.map((stopId, i) => ({ stopId, time: ['10:30:00', '11:00:00', '11:30:00'][i] })) }));
    const source = new CtanDeparturesSource(async () => ({ mode: 'scheduled', status: 'ok', data: feed, message: '' }), async () => response([{ ...item, idLinea: '300', nombre: 'M-141' }, { ...item, idLinea: '299', nombre: 'M-140', servicio: '10:45' }]));
    const board = await source.get('ctan:1_100', testNow);
    expect(board.departures).toHaveLength(1);
    expect(board.departures[0]).toMatchObject({ line: 'M-140', time: '10:30' });
    expect(board.sourceLabel).toContain('festivos');
  });
  it('rechaza paradas ajenas al corredor y comunica errores de red sin crear salidas', async () => {
    const feed = testFeed();
    const load = async (): Promise<Snapshot> => ({ mode: 'scheduled', status: 'ok', data: feed, message: '' });
    const request = vi.fn(async () => { throw new Error('offline'); });
    const source = new CtanDeparturesSource(load, request);
    expect((await departuresResponse(new Request('https://example.invalid/api/departures?stopId=bad'), source)).status).toBe(400);
    expect((await departuresResponse(new Request('https://example.invalid/api/departures?stopId=ctan:1_999'), source)).status).toBe(404);
    expect(request).not.toHaveBeenCalled();
    expect(await source.get('ctan:1_100', testNow)).toMatchObject({ status: 'unavailable', departures: [] });
  });
});

it('enriquece nombres y operador usando los datos publicados por CTAN', async () => {
  const feed = testFeed();
  const enriched = await enrichCtanMetadata(feed, async (url) => String(url).endsWith('/paradas')
    ? Response.json({ paradas: [{ idParada: '100', municipio: 'ISLA MAYOR' }, { idParada: '101', municipio: 'CORIA DEL RÍO' }, { idParada: '102', municipio: 'SEVILLA' }] })
    : Response.json({ idLinea: '324', nombre: 'M-143 Isla Mayor - Sevilla', operadores: 'TRANVIAS DE SEVILLA S.A' }));
  expect(enriched.stops[0].town).toBe('Isla Mayor');
  expect(enriched.routes[0]).toMatchObject({ shortName: 'M-143', ctanLineId: '324', ctanDirection: '1', destination: 'Sevilla · Test Sevilla', operator: 'TRANVIAS DE SEVILLA S.A' });
});
