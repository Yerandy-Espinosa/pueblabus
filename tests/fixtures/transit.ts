import type { Feed, Vehicle } from '../../src/transit';

// Synthetic geometry and times for deterministic tests; never deployed as data.
export const testNow = new Date('2026-11-02T09:15:00Z'); // 10:15 Madrid
export function testFeed(): Feed {
  const stops: Feed['stops'] = [
    { id: 'ctan:1_100', name: 'Test Isla', town: 'Isla Mayor', position: [37, -6], minutesFromStart: 0 },
    { id: 'ctan:1_101', name: 'Test Coria', town: 'Coria del Río', position: [37.05, -6], minutesFromStart: 30 },
    { id: 'ctan:1_102', name: 'Test Sevilla', town: 'Sevilla', position: [37.1, -6.05], minutesFromStart: 60 },
  ];
  const shape: Feed['routes'][number]['shape'] = [[37, -6], [37.05, -6], [37.05, -6.05], [37.1, -6.05]];
  const routes: Feed['routes'] = [
    { id: 'ctan:1_324:1', shortName: 'M-143', name: 'Test Isla → Sevilla', destination: 'Sevilla', color: '#21796a', durationMinutes: 60, geometry: 'shape', shape, stopIds: stops.map(s => s.id), ctanLineId: '324', ctanDirection: '1' },
    { id: 'ctan:1_324:2', shortName: 'M-143', name: 'Test Sevilla → Isla', destination: 'Isla Mayor', color: '#c78942', durationMinutes: 60, geometry: 'shape', shape: [...shape].reverse(), stopIds: stops.map(s => s.id).reverse(), ctanLineId: '324', ctanDirection: '2' },
  ];
  return {
    updatedAt: testNow.toISOString(), stops, routes, vehicles: [], timetables: [],
    calendar: [{ id: 'test-daily', start: '2026-01-01', end: '2026-12-31', days: [true, true, true, true, true, true, true], holidayOperation: true }], exceptions: [], holidays: [],
    source: { url: 'https://example.invalid/test.zip', name: 'Synthetic test data', fetchedAt: testNow.toISOString(), validUntil: '2026-12-31' },
    journeys: routes.map((r, i) => ({ id: `test-trip-${i}`, routeId: r.id, serviceId: 'test-daily', departure: '10:00:00', arrival: '11:00:00', stopTimes: r.stopIds.map((id, index) => ({ stopId: id, time: ['10:00:00', '10:30:00', '11:00:00'][index] })) })),
  };
}
export function testGps(feed: Feed, now = testNow): Vehicle {
  return { id: 'ctas:test-bus', label: 'Test bus', routeId: feed.routes[0].id, position: [37.04, -6], nextStopId: feed.stops[1].id, arrivalMinutes: 0, etaAvailable: false, nextStopKnown: false, positionSource: 'gps', updatedAt: now.toISOString() };
}

export function corridorTestFeed(): Feed {
  const feed = testFeed();
  const island = { ...feed.stops[0], position: [37.13, -6.16] as [number, number] };
  const puebla = { id: 'ctan:1_3290', name: 'Test Los Juncales', town: 'Puebla Del Rio', position: [37.26, -6.0765] as [number, number], minutesFromStart: 20 };
  const coria = { ...feed.stops[1], position: [37.285, -6.05] as [number, number] };
  const seville = { ...feed.stops[2], position: [37.379, -5.994] as [number, number] };
  const stops = [island, puebla, coria, seville];
  const shape: Feed['routes'][number]['shape'] = [island.position, [37.24, -6.12], puebla.position, [37.261, -6.073], [37.267, -6.062], coria.position, [37.325, -6.031], [37.355, -6.025], [37.365, -6.015], seville.position];
  const routes = feed.routes.map((r, i) => ({ ...r, stopIds: (i ? [...stops].reverse() : stops).map(s => s.id), shape: i ? [...shape].reverse() : shape }));
  return { ...feed, stops, routes, journeys: routes.map((r, i) => ({ ...feed.journeys![i], stopTimes: r.stopIds.map((id, index) => ({ stopId: id, time: (i ? ['10:00:00', '10:30:00', '10:40:00', '11:00:00'] : ['10:00:00', '10:20:00', '10:30:00', '11:00:00'])[index] })) })) };
}
