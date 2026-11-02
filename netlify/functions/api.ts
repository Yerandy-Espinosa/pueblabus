import type { Context } from '@netlify/functions';
import { FeedService } from '../../server/feed.ts';
import { officialTransitService } from '../../server/transit-service.ts';
import { departuresResponse } from '../../server/departures.ts';

// Kept across warm invocations; every cold start can reconnect independently.
let service: FeedService | undefined;
const official = officialTransitService();
export async function handleRequest(request: Request, source?: FeedService): Promise<Response> {
  const path = new URL(request.url).pathname;
  const endpoint = path.replace(/^\/(?:api|\.netlify\/functions\/api)\/?/, '');
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET') return Response.json({ message: 'Método no permitido' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  if (endpoint === 'health') return Response.json({ status: 'ok' }, { headers });
  if (endpoint === 'departures') return departuresResponse(request);
  if (endpoint !== 'transit') return Response.json({ message: 'Endpoint no encontrado' }, { status: 404, headers });
  try {
    if (!source && (process.env.TRANSIT_FEED_URL || process.env.TRANSIT_MODE !== 'demo')) {
      const snapshot = await official.get();
      return Response.json(snapshot, { status: snapshot.status === 'unavailable' ? 503 : 200, headers });
    }
    service ??= new FeedService(process.env.TRANSIT_FEED_URL);
    const snapshot = await (source || service).get();
    return Response.json(snapshot, { status: snapshot.status === 'unavailable' ? 503 : 200, headers });
  } catch {
    return Response.json({ mode: 'live', status: 'unavailable', data: null, message: 'La fuente de transporte no está configurada correctamente.' }, { status: 503, headers });
  }
}

export default (request: Request, _context: Context) => handleRequest(request);
