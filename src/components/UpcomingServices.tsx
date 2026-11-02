import { ArrowRight, Clock3 } from 'lucide-react';
import { displayTime, journeysFor, madridMinutes, normalize, serviceDate, timeMinutes, type Feed, type Stop } from '../transit';

export default function UpcomingServices({ feed, routeId, query, now, onStop }: { feed: Feed; routeId: string; query: string; now: number; onStop: (stop: Stop) => void }) {
  const today = serviceDate(new Date(now));
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dates = [today, tomorrow.toISOString().slice(0, 10)];
  const rows = dates.flatMap((date, day) => feed.routes.filter(r => (routeId === 'all' || r.id === routeId) && normalize(`${r.name} ${r.shortName} ${r.destination}`).includes(normalize(query))).flatMap(route => journeysFor(feed, route.id, date).filter(j => day > 0 || timeMinutes(j.departure) >= madridMinutes(new Date(now))).map(j => ({ journey: j, route, day, sort: day * 1440 + timeMinutes(j.departure) })))).sort((a, b) => a.sort - b.sort).slice(0, 4);
  return <section className="upcoming-services"><div className="list-heading"><h2>Próximas salidas programadas</h2><Clock3 size={14} /></div>{rows.map(({ journey, route, day }) => <button key={`${day}:${journey.id}`} className="upcoming-card" onClick={() => { const stop = feed.stops.find(s => s.id === route.stopIds[0]); if (stop) onStop(stop); }}><span className="upcoming-time">{displayTime(journey.departure)}<small>{day ? 'Mañana' : 'Hoy'}</small></span><span className="upcoming-route"><strong>{route.destination}</strong><small>{route.shortName} · {feed.stops.find(s => s.id === route.stopIds[0])?.town}</small></span><ArrowRight size={16} /></button>)}{rows.length === 0 && <p className="schedule-note">No hay próximas salidas publicadas para este sentido. Consulta otra fecha en Horarios.</p>}</section>;
}
