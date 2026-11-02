import { normalize, type Route } from './transit';

export const DIRECTIONS = {
  toSeville: { label: 'Hacia Sevilla', color: '#15803d', symbol: '↑' },
  fromSeville: { label: 'Desde Sevilla', color: '#dc2626', symbol: '↓' },
} as const;

export const ROUTE_COLOR = '#f59e0b';

export function directionFor(route: Pick<Route, 'ctanDirection' | 'destination'>) {
  const outbound = route.ctanDirection ? route.ctanDirection === '1' : /\bsevilla\b/.test(normalize(route.destination));
  return outbound ? DIRECTIONS.toSeville : DIRECTIONS.fromSeville;
}
