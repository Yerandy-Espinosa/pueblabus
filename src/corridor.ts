import { stopProgresses } from './estimates';
import { normalize, pointAlong, timeMinutes, type Feed, type Point } from './transit';

const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(b[0] * Math.PI / 180));

function sliceShape(shape: Point[], start: number, end: number): Point[] {
  const lengths = shape.slice(1).map((p, i) => length(shape[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  let travelled = 0;
  return [pointAlong(shape, start), ...shape.filter((_, i) => {
    if (i) travelled += lengths[i - 1];
    return travelled > start * total + 1e-10 && travelled < end * total - 1e-10;
  }), pointAlong(shape, end)];
}

function progressAt(shape: Point[], point: Point): number {
  const lengths = shape.slice(1).map((p, i) => length(shape[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  let travelled = 0, closest = Infinity, progress = 0;
  lengths.forEach((segment, i) => {
    const a = shape[i], b = shape[i + 1], scale = Math.cos(b[0] * Math.PI / 180);
    const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
    const px = (point[1] - a[1]) * scale, py = point[0] - a[0];
    const t = segment ? Math.max(0, Math.min(1, (px * dx + py * dy) / segment ** 2)) : 0;
    const distance = Math.hypot(px - t * dx, py - t * dy);
    if (distance < closest) { closest = distance; progress = total ? (travelled + t * segment) / total : 0; }
    travelled += segment;
  });
  return progress;
}

// A presentation of the requested corridor. Keep the full source feed for GPS
// matching and fallback estimates, including M-143's journey from Isla Mayor.
export function pueblaCorridor(feed: Feed): Feed {
  const bounds = new Map<string, { start: number; end: number }>();
  const routes = feed.routes.map(route => {
    // Los Juncales is the published Puebla terminus of M-140/M-141 and a
    // shared M-143 stop. Metadata may be unavailable, so retain the official ID.
    const anchor = route.stopIds.findIndex(id => id === 'ctan:1_3290' || feed.stops.some(s => s.id === id && normalize(s.town).includes('puebla') && /juncales/.test(normalize(s.name))));
    if (anchor < 0 || !route.ctanDirection) return route;
    const toSeville = route.ctanDirection === '1';
    const progress = stopProgresses(feed, route).get(route.stopIds[anchor])!;
    const start = toSeville && anchor > 0 ? progress : 0;
    const end = !toSeville && anchor < route.stopIds.length - 1 ? progress : 1;
    bounds.set(route.id, { start, end });
    const stopIds = toSeville ? route.stopIds.slice(anchor) : route.stopIds.slice(0, anchor + 1);
    const continues = !toSeville && anchor < route.stopIds.length - 1;
    return { ...route, stopIds, shape: start === 0 && end === 1 ? route.shape : sliceShape(route.shape, start, end),
      name: toSeville ? `La Puebla del Río → ${route.destination}` : 'Sevilla → La Puebla del Río',
      destination: toSeville ? route.destination : 'La Puebla del Río',
      serviceLabel: [route.serviceLabel, continues ? 'continúa a Isla Mayor' : ''].filter(Boolean).join(' · '),
    };
  });
  if (!bounds.size) return feed;
  const journeys = feed.journeys?.map(journey => {
    const route = routes.find(r => r.id === journey.routeId)!;
    const stopTimes = journey.stopTimes.filter(s => route.stopIds.includes(s.stopId));
    return { ...journey, stopTimes, departure: stopTimes[0].time, arrival: stopTimes.at(-1)!.time };
  });
  const visibleIds = new Set(routes.flatMap(r => r.stopIds));
  return { ...feed, routes: routes.map(r => {
    const journey = journeys?.find(j => j.routeId === r.id);
    return journey ? { ...r, durationMinutes: Math.ceil(timeMinutes(journey.arrival) - timeMinutes(journey.departure)) } : r;
  }), journeys, stops: feed.stops.filter(s => visibleIds.has(s.id)), vehicles: feed.vehicles.filter(v => {
    const bound = bounds.get(v.routeId);
    if (!bound || bound.start === 0 && bound.end === 1) return true;
    const progress = progressAt(feed.routes.find(r => r.id === v.routeId)!.shape, v.position);
    return progress >= bound.start - 1e-6 && progress <= bound.end + 1e-6;
  }) };
}
