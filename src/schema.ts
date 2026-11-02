import { z } from 'zod';

export const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
export const stopSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), town: z.string().min(1),
  position: point, minutesFromStart: z.number().nonnegative(),
});
export const routeSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), shortName: z.string().min(1),
  destination: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shape: z.array(point).min(2), stopIds: z.array(z.string()).min(2),
  durationMinutes: z.number().positive(),
  geometry: z.enum(['shape', 'stops']).optional(),
  operator: z.string().optional(),
});
const gtfsTime = z.string().regex(/^\d{2,3}:[0-5]\d(?::[0-5]\d)?$/);
const serviceDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const vehicleSchema = z.object({
  id: z.string().min(1), routeId: z.string(), position: point,
  nextStopId: z.string(), arrivalMinutes: z.number().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export const timetableSchema = z.object({
  routeId: z.string(), weekdays: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  saturday: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  sunday: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
});
export const feedSchema = z.object({
  updatedAt: z.iso.datetime(), routes: z.array(routeSchema).min(1),
  stops: z.array(stopSchema).min(2), vehicles: z.array(vehicleSchema),
  timetables: z.array(timetableSchema),
  journeys: z.array(z.object({
    id: z.string(), routeId: z.string(), serviceId: z.string(), departure: gtfsTime, arrival: gtfsTime,
    stopTimes: z.array(z.object({ stopId: z.string(), time: gtfsTime })).min(2),
  })).optional(),
  calendar: z.array(z.object({ id: z.string(), start: serviceDay, end: serviceDay, days: z.array(z.boolean()).length(7) })).optional(),
  exceptions: z.array(z.object({ serviceId: z.string(), date: serviceDay, added: z.boolean() })).optional(),
  source: z.object({ url: z.url(), fetchedAt: z.iso.datetime(), name: z.string(), validUntil: serviceDay.optional() }).optional(),
}).superRefine((feed, ctx) => {
  const stops = new Set(feed.stops.map(s => s.id));
  const routes = new Set(feed.routes.map(r => r.id));
  if (stops.size !== feed.stops.length || routes.size !== feed.routes.length || new Set(feed.vehicles.map(v => v.id)).size !== feed.vehicles.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
  }
  for (const route of feed.routes) {
    if (route.stopIds.some(id => !stops.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown route stop' });
  }
  for (const vehicle of feed.vehicles) {
    const route = feed.routes.find(r => r.id === vehicle.routeId);
    if (!route || !route.stopIds.includes(vehicle.nextStopId)) ctx.addIssue({ code: 'custom', message: 'Unknown vehicle route or stop' });
  }
  for (const table of feed.timetables) {
    if (!routes.has(table.routeId)) ctx.addIssue({ code: 'custom', message: 'Unknown timetable route' });
  }
  for (const journey of feed.journeys || []) {
    const route = feed.routes.find(r => r.id === journey.routeId);
    if (!route || journey.stopTimes.some(s => !route.stopIds.includes(s.stopId))) ctx.addIssue({ code: 'custom', message: 'Invalid journey route or stops' });
  }
});
