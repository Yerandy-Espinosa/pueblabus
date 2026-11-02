import type { z } from 'zod';
import type { point, stopSchema, routeSchema, vehicleSchema, feedSchema } from './schema';

export type Point = z.infer<typeof point>;
export type Stop = z.infer<typeof stopSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Feed = z.infer<typeof feedSchema>;
export type Snapshot = {
  mode: 'demo' | 'live' | 'scheduled'; status: 'ok' | 'stale' | 'unavailable';
  message: string; data: Feed | null;
};

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
  const active = (id: string) => {
    const exception = feed.exceptions?.find(e => e.serviceId === id && e.date === date);
    if (exception) return exception.added;
    const calendar = feed.calendar?.find(c => c.id === id);
    return !!calendar && date >= calendar.start && date <= calendar.end && calendar.days[day];
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
