import { mkdir, writeFile, rename } from 'node:fs/promises';
import { importGtfs, CTAN_GTFS_URL } from '../server/gtfs.ts';

async function sync() {
  const url = new URL(process.env.CTAN_GTFS_URL || CTAN_GTFS_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'api.ctan.es') throw new Error('La fuente de horarios debe ser la API HTTPS oficial de CTAN');
  console.log(`Descargando horarios oficiales: ${url.href}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`No se ha podido descargar el GTFS oficial (HTTP ${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 100_000_000) throw new Error('GTFS mayor de 100 MB');
  const feed = importGtfs(bytes);
  await mkdir('data', { recursive: true });
  await writeFile('data/ctan.json.tmp', JSON.stringify(feed));
  await rename('data/ctan.json.tmp', 'data/ctan.json');
  console.log(`Importadas ${feed.routes.length} variantes, ${feed.stops.length} paradas y ${feed.journeys!.length} viajes. Vigencia hasta ${feed.source!.validUntil}. Sin posiciones GPS inventadas.`);
}

try {
  await sync();
} catch (error) {
  console.error('No se han actualizado los horarios oficiales:', error instanceof Error ? error.message : 'error de importación');
  if (process.argv.includes('--optional')) {
    console.warn('La web se compilará igualmente. Sin un GTFS válido, la API indicará que los horarios no están disponibles; no se generará una demo.');
  } else {
    process.exitCode = 1;
  }
}
