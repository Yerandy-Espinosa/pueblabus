import { z } from 'zod';
import { feedSchema } from '../src/schema.ts';
import type { Feed } from '../src/transit.ts';

const api = 'https://api.ctan.es/v1/Consorcios/1';
const detailSchema = z.object({ idLinea: z.coerce.string(), nombre: z.string(), operadores: z.string() });
const stopsSchema = z.object({ paradas: z.array(z.object({ idParada: z.coerce.string(), municipio: z.string(), nucleo: z.string().optional() })) });
const titleCase = (text: string) => text.toLocaleLowerCase('es').replace(/(^|\s)\p{L}/gu, char => char.toLocaleUpperCase('es'));

export async function enrichCtanMetadata(feed: Feed, request: typeof fetch = fetch): Promise<Feed> {
  const ids = [...new Set(feed.routes.flatMap(r => /^ctan:1_(\d+):/.exec(r.id)?.[1] || []))];
  const get = async (url: string) => {
    const response = await request(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`CTAN metadata HTTP ${response.status}`);
    return response.json();
  };
  const [allStops, details] = await Promise.all([
    get(`${api}/paradas`).then(v => stopsSchema.parse(v)),
    Promise.all(ids.map(async id => detailSchema.parse(await get(`${api}/lineas/${id}`)))),
  ]);
  const towns = new Map(allStops.paradas.map(s => [`ctan:1_${s.idParada}`, titleCase(s.nucleo || s.municipio)]));
  const stops = feed.stops.map(s => ({ ...s, town: towns.get(s.id) || s.town }));
  const stopMap = new Map(stops.map(s => [s.id, s]));
  const routes = feed.routes.map(route => {
    const id = /^ctan:1_(\d+):/.exec(route.id)?.[1];
    const detail = details.find(d => d.idLinea === id);
    if (!detail) return route;
    const first = stopMap.get(route.stopIds[0])!, last = stopMap.get(route.stopIds.at(-1)!)!;
    const toSeville = last.town.toLowerCase().includes('sevilla');
    return { ...route, ctanLineId: id, ctanDirection: toSeville ? '1' as const : '2' as const,
      shortName: detail.nombre.match(/M-\d+[A-Z]?/)?.[0] || route.shortName,
      destination: `${last.town} · ${last.name}`, name: `${first.town} → ${last.town} · ${last.name}`,
      operator: detail.operadores.replace(/,\s*$/, ''),
      serviceLabel: /sab|fest/i.test(detail.nombre) ? 'Sábados, domingos y festivos' : route.operatesOnWeekends === false ? 'Solo laborables' : route.shortName.startsWith('140') ? 'Según calendario oficial' : 'Laborables',
    };
  });
  return feedSchema.parse({ ...feed, routes, stops });
}
