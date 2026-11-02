import { pointAlong, type Feed, type Point, type Stop } from '../src/transit.ts';

// Illustrative coordinates and stop names, NOT verified operator stops or geometry.
export const stops: Stop[] = [
  { id: 'isla', name: 'Isla Mayor · Centro', town: 'Isla Mayor', position: [37.1335, -6.1628], minutesFromStart: 0 },
  { id: 'alfonso', name: 'Poblado de Alfonso XIII', town: 'Isla Mayor', position: [37.174, -6.16], minutesFromStart: 10 },
  { id: 'puebla', name: 'La Puebla · Centro', town: 'La Puebla del Río', position: [37.267, -6.062], minutesFromStart: 28 },
  { id: 'coria', name: 'Coria · Centro', town: 'Coria del Río', position: [37.287, -6.052], minutesFromStart: 35 },
  { id: 'gelves', name: 'Gelves · Centro', town: 'Gelves', position: [37.335, -6.026], minutesFromStart: 47 },
  { id: 'sanjuan', name: 'San Juan · Centro', town: 'San Juan de Aznalfarache', position: [37.358, -6.025], minutesFromStart: 55 },
  { id: 'sevilla', name: 'Sevilla · Plaza de Armas', town: 'Sevilla', position: [37.3905, -6.004], minutesFromStart: 70 },
];

export const shape: Point[] = [
  [37.1335, -6.1628], [37.143, -6.160], [37.158, -6.158], [37.174, -6.16],
  [37.191, -6.153], [37.206, -6.139], [37.221, -6.122], [37.235, -6.103],
  [37.246, -6.083], [37.259, -6.066], [37.267, -6.062], [37.278, -6.058],
  [37.287, -6.052], [37.302, -6.044], [37.318, -6.036], [37.335, -6.026],
  [37.347, -6.025], [37.358, -6.025], [37.369, -6.020], [37.379, -6.015],
  [37.387, -6.01], [37.3905, -6.004],
];

export function createDemo(now = new Date()): Feed {
  const updatedAt = now.toISOString();
  const routes = [
    { id: 'outbound', name: 'Isla Mayor → Sevilla', shortName: 'PB · Demo', destination: 'Sevilla', color: '#21796a', shape, stopIds: stops.map(s => s.id), durationMinutes: 70 },
    { id: 'inbound', name: 'Sevilla → Isla Mayor', shortName: 'PB · Demo', destination: 'Isla Mayor', color: '#c78942', shape: [...shape].reverse(), stopIds: stops.map(s => s.id).reverse(), durationMinutes: 70 },
  ];
  const vehicles = [0.12, 0.62, 0.23, 0.77].map((offset, i) => {
    const route = routes[i < 2 ? 0 : 1];
    const progress = (now.getTime() / 1000 / (70 * 60) + offset) % 1;
    const stopIndex = Math.min(route.stopIds.length - 1, Math.floor(progress * (route.stopIds.length - 1)) + 1);
    return { id: `PB-${101 + i}`, routeId: route.id, position: pointAlong(route.shape, progress), nextStopId: route.stopIds[stopIndex], arrivalMinutes: Math.max(1, Math.ceil((stopIndex / (route.stopIds.length - 1) - progress) * 70)), updatedAt };
  });
  return {
    updatedAt, stops, routes, vehicles,
    timetables: routes.map((r, i) => ({
      routeId: r.id,
      weekdays: i === 0 ? ['06:00', '07:15', '08:30', '10:00', '12:00', '14:00', '15:30', '17:00', '19:00', '21:00'] : ['07:00', '08:15', '09:45', '11:30', '13:30', '15:00', '16:30', '18:00', '20:00', '22:15'],
      saturday: i === 0 ? ['07:30', '10:00', '13:00', '16:00', '19:00', '21:00'] : ['09:00', '11:30', '14:30', '17:30', '20:30', '22:15'],
      sunday: i === 0 ? ['09:00', '12:00', '16:00', '20:00'] : ['10:30', '13:30', '17:30', '21:30'],
    })),
  };
}
