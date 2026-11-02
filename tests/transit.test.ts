import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedSchema } from '../src/schema';
import { createDemo } from '../server/demo';
import { FeedService } from '../server/feed';
import { addMinutes, departuresFor, normalize, pointAlong, serviceDate } from '../src/transit';

afterEach(() => vi.useRealTimers());

describe('datos y recorridos de demostración', () => {
  it('genera referencias de rutas y paradas coherentes y posiciones que avanzan', () => {
    const first = createDemo(new Date('2026-11-02T10:00:00Z'));
    const second = createDemo(new Date('2026-11-02T10:00:05Z'));
    expect(feedSchema.parse(first).vehicles).toHaveLength(4);
    expect(first.vehicles[0].position).not.toEqual(second.vehicles[0].position);
    for (const vehicle of first.vehicles) {
      expect(first.routes.find(r => r.id === vehicle.routeId)?.stopIds).toContain(vehicle.nextStopId);
    }
  });
  it('interpola por distancia y respeta los extremos del recorrido', () => {
    expect(pointAlong([[0, 0], [2, 0], [10, 0]], 0.5)).toEqual([5, 0]);
    expect(pointAlong([[0, 0], [2, 0]], -1)).toEqual([0, 0]);
    expect(pointAlong([[0, 0], [2, 0]], 2)).toEqual([2, 0]);
  });
  it('selecciona los horarios según el día y el sentido', () => {
    const data = createDemo();
    expect(departuresFor(data, 'outbound', '2026-11-02')).toHaveLength(10);
    expect(departuresFor(data, 'outbound', '2026-11-07')).toHaveLength(6);
    expect(departuresFor(data, 'outbound', '2026-11-08')).toHaveLength(4);
    expect(departuresFor(data, 'inbound', '2026-11-08')[0]).toBe('10:30');
    expect(departuresFor(data, 'missing', '2026-11-08')).toEqual([]);
  });
  it('usa la fecha peninsular y suma llegadas que cruzan medianoche', () => {
    expect(serviceDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03');
    expect(addMinutes('23:30', 70)).toBe('00:40');
    expect(normalize('RÍO')).toBe('rio');
  });
});

describe('fuente GPS: no confundir fallos con datos de ejemplo', () => {
  it('identifica siempre la demo cuando no hay fuente', async () => {
    expect(await new FeedService().get()).toMatchObject({ mode: 'demo', status: 'ok' });
  });
  it('valida la fuente y combina peticiones simultáneas', async () => {
    const mock = vi.fn(async () => Response.json(createDemo()));
    const service = new FeedService('https://operator.example/feed', mock);
    const [a, b] = await Promise.all([service.get(), service.get()]);
    expect(a).toMatchObject({ mode: 'live', status: 'ok' });
    expect(a).toEqual(b);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('no muestra demo si falla una fuente real configurada', async () => {
    const service = new FeedService('https://operator.example/feed', vi.fn(async () => { throw new Error('offline'); }));
    expect(await service.get()).toMatchObject({ mode: 'live', status: 'unavailable', data: null });
  });
  it('conserva la última posición e indica que está desactualizada tras un fallo', async () => {
    vi.useFakeTimers();
    const data = createDemo();
    const mock = vi.fn().mockResolvedValueOnce(Response.json(data)).mockRejectedValueOnce(new Error('offline'));
    const service = new FeedService('https://operator.example/feed', mock);
    await service.get();
    vi.advanceTimersByTime(5_001);
    expect(await service.get()).toMatchObject({ mode: 'live', status: 'stale', data });
  });
  it('marca las posiciones antiguas y rechaza fechas futuras', async () => {
    const old = createDemo(new Date(Date.now() - 120_000));
    expect(await new FeedService('https://operator.example/feed', async () => Response.json(old)).get()).toMatchObject({ status: 'stale' });
    const future = createDemo(new Date(Date.now() + 120_000));
    expect(await new FeedService('https://operator.example/feed', async () => Response.json(future)).get()).toMatchObject({ status: 'unavailable', data: null });
  });
  it('rechaza coordenadas y referencias de parada inválidas', async () => {
    const data = createDemo();
    data.vehicles[0].nextStopId = 'unknown';
    expect(await new FeedService('https://operator.example/feed', async () => Response.json(data)).get()).toMatchObject({ status: 'unavailable' });
    data.vehicles[0].position = [200, 0];
    expect(feedSchema.safeParse(data).success).toBe(false);
  });
  it('exige HTTPS para la conexión externa', () => {
    expect(() => new FeedService('http://operator.example')).toThrow('HTTPS');
  });
});
