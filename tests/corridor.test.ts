import { describe, expect, it } from 'vitest';
import { pueblaCorridor } from '../src/corridor';
import { corridorTestFeed, testGps } from './fixtures/transit';

describe('La Puebla–Sevilla presentation', () => {
  it('clips both M-143 directions at Puebla, keeping official bends and boarding times', () => {
    const source = corridorTestFeed();
    const original = structuredClone(source);
    const view = pueblaCorridor(source);
    const puebla = source.stops[1];
    expect(view.stops.map(s => s.id)).not.toContain(source.stops[0].id);
    expect(view.routes[0].stopIds[0]).toBe(puebla.id);
    expect(view.routes[1].stopIds.at(-1)).toBe(puebla.id);
    expect(view.routes[0].shape).toEqual(source.routes[0].shape.slice(2));
    expect(view.routes[1].shape).toEqual(source.routes[1].shape.slice(0, -2));
    expect(view.routes[1].serviceLabel).toContain('continúa a Isla Mayor');
    expect(view.journeys![0].departure).toBe('10:20:00');
    expect(view.journeys![1].arrival).toBe('10:40:00');
    expect(view.routes.map(r => r.durationMinutes)).toEqual([40, 40]);
    expect(source).toEqual(original);
  });

  it('keeps GPS coordinates intact inside the corridor and hides vehicles outside it', () => {
    const source = corridorTestFeed();
    const gps = { ...testGps(source), position: [37.3, -6.04] as [number, number] };
    source.vehicles = [gps, { ...gps, id: 'before-puebla', position: [37.2, -6.14] }, { ...gps, id: 'past-puebla', routeId: source.routes[1].id, position: [37.2, -6.14] }];
    expect(pueblaCorridor(source).vehicles).toEqual([gps]);
  });
});
