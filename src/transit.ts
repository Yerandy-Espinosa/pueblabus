import type { z } from 'zod';
import type { point, stopSchema, routeSchema, vehicleSchema, feedSchema } from './schema';

export type Point = z.infer<typeof point>;
export type Stop = z.infer<typeof stopSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Feed = z.infer<typeof feedSchema>;
export type Snapshot = {
  mode: 'demo' | 'live' | 'scheduled' | 'estimated' | 'mixed'; status: 'ok' | 'stale' | 'unavailable';
  message: string; data: Feed | null;
  gps?: { status: 'connected' | 'unavailable' | 'not_configured' | 'stale'; checkedAt: string; source?: string };
};
export type DepartureBoard = {
  stopId: string; status: 'ok' | 'unavailable'; checkedAt: string; from: string; until: string; message: string;
  sourceLabel?: string;
  departures: { id: string; line: string; destination: string; time: string; date: string; inMinutes: number; boarding: boolean; scheduled: true }[];
};

export function madridMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  return value('hour') * 60 + value('minute') + value('second') / 60;
}

export function pointAlong(shape: Point[], progress: number): Point {
  const lengths = shape.slice(1).map((p, i) => Math.hypot((p[0] - shape[i][0]), (p[1] - shape[i][1]) * Math.cos(p[0] * Math.PI / 180)));
  let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] && lengths[i] > 0) {
      const t = distance / lengths[i];
      return [shape[i][0] + (shape[i + 1][0] - shape[i][0]) * t, shape[i][1] + (shape[i + 1][1] - shape[i][1]) * t];
    }
    distance -= lengths[i];
  }
  return shape[shape.length - 1];
}

export function serviceDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function departuresFor(feed: Feed, routeId: string, date: string): string[] {
  if (feed.journeys) return journeysFor(feed, routeId, date).map(j => j.departure);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const table = feed.timetables.find(t => t.routeId === routeId);
  return table ? [...(day === 0 ? table.sunday : day === 6 ? table.saturday : table.weekdays)].sort() : [];
}

export function journeysFor(feed: Feed, routeId: string, date: string) {
  const day = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const holiday = feed.holidays?.includes(date) || false;
  const route = feed.routes.find(r => r.id === routeId);
  if (route?.operatesOnWeekends === false && day >= 5 || route?.operatesOnHolidays === false && holiday) return [];
  const active = (id: string) => {
    const exception = feed.exceptions?.find(e => e.serviceId === id && e.date === date);
    if (exception) return exception.added;
    const calendar = feed.calendar?.find(c => c.id === id);
    return !!calendar && date >= calendar.start && date <= calendar.end && (holiday ? calendar.holidayOperation ?? calendar.days[6] : calendar.days[day]);
  };
  return (feed.journeys || []).filter(j => j.routeId === routeId && active(j.serviceId)).sort((a, b) => timeMinutes(a.departure) - timeMinutes(b.departure));
}

export function timeMinutes(time: string): number {
  const [h, m, s = 0] = time.split(':').map(Number);
  return h * 60 + m + s / 60;
}

export function displayTime(time: string): string {
  const value = Math.floor(timeMinutes(time));
  const day = Math.floor(value / 1440);
  return `${Math.floor(value / 60 % 24).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}${day ? ` (+${day})` : ''}`;
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
