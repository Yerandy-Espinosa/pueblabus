import { journeysFor, madridMinutes, pointAlong, serviceDate, timeMinutes, type Feed, type Point, type Route, type Vehicle } from './transit.ts';

const segmentLength = (a: Point, b: Point) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(b[0] * Math.PI / 180));
const geometryCache = new WeakMap<Feed, Map<string, Map<string, number>>>();

// Project each stop onto its direction-specific shape, preserving traversal order.
// This keeps a timetable estimate on the published road geometry, including bends.
export function stopProgresses(feed: Feed, route: Route): Map<string, number> {
  const lengths = route.shape.slice(1).map((p, i) => segmentLength(route.shape[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const result = new Map<string, number>();
  let floor = 0;
  for (const id of route.stopIds) {
    const stop = feed.stops.find(s => s.id === id);
    if (!stop) continue;
    let bestDistance = Infinity, bestProgress = floor, travelled = 0;
    for (let i = 0; i < lengths.length; i++) {
      const a = route.shape[i], b = route.shape[i + 1], scale = Math.cos(b[0] * Math.PI / 180);
      const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
      const sx = (stop.position[1] - a[1]) * scale, sy = stop.position[0] - a[0];
      const t = lengths[i] ? Math.max(0, Math.min(1, (sx * dx + sy * dy) / (lengths[i] ** 2))) : 0;
      const progress = total ? (travelled + t * lengths[i]) / total : 0;
      if (progress + 1e-8 >= floor) {
        const distance = Math.hypot(sx - t * dx, sy - t * dy);
        if (distance < bestDistance) { bestDistance = distance; bestProgress = progress; }
      }
      travelled += lengths[i];
    }
    floor = bestProgress;
    result.set(id, bestProgress);
  }
  return result;
}

export function estimateVehicles(feed: Feed, now = new Date()): Vehicle[] {
  const today = serviceDate(now);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const days = [today, yesterday.toISOString().slice(0, 10)];
  let progressCache = geometryCache.get(feed);
  if (!progressCache) { progressCache = new Map(); geometryCache.set(feed, progressCache); }
  const result: Vehicle[] = [];
  for (const [dayIndex, date] of days.entries()) {
    const minute = madridMinutes(now) + dayIndex * 1440;
    for (const route of feed.routes) {
      for (const journey of journeysFor(feed, route.id, date)) {
        if (minute < timeMinutes(journey.departure) || minute >= timeMinutes(journey.arrival)) continue;
        if (!progressCache.has(route.id)) progressCache.set(route.id, stopProgresses(feed, route));
        const progresses = progressCache.get(route.id)!;
        const nextIndex = journey.stopTimes.findIndex(s => timeMinutes(s.time) > minute);
        const next = journey.stopTimes[nextIndex < 0 ? journey.stopTimes.length - 1 : nextIndex];
        const previous = journey.stopTimes[nextIndex < 0 ? journey.stopTimes.length - 1 : Math.max(0, nextIndex - 1)];
        const start = progresses.get(previous.stopId) || 0;
        const end = progresses.get(next.stopId) ?? 1;
        const duration = timeMinutes(next.time) - timeMinutes(previous.time);
        const fraction = duration > 0 ? Math.max(0, Math.min(1, (minute - timeMinutes(previous.time)) / duration)) : 1;
        result.push({ id: `estimated:${date}:${journey.id}`, label: `${route.shortName} · ${journey.departure.slice(0, 5)}`, journeyId: journey.id, routeId: route.id,
          position: pointAlong(route.shape, start + (end - start) * fraction), nextStopId: next.stopId,
          arrivalMinutes: Math.max(0, Math.ceil(timeMinutes(next.time) - minute)), updatedAt: now.toISOString(), positionSource: 'estimate' });
      }
    }
  }
  return result;
}

export function coverageKey(route: Route): string {
  return route.ctanDirection ? `${route.shortName}:${route.ctanDirection}` : route.id;
}

export function mergeEstimates(feed: Feed, gps: Vehicle[], now: Date): Vehicle[] {
  const covered = new Set(gps.flatMap(v => {
    const route = feed.routes.find(r => r.id === v.routeId);
    return route ? [coverageKey(route)] : [];
  }));
  return [...gps, ...estimateVehicles(feed, now).filter(v => !covered.has(coverageKey(feed.routes.find(r => r.id === v.routeId)!)))];
}
