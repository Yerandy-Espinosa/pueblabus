import { expect, test } from '@playwright/test';
import { createDemo } from '../../server/demo';

test.beforeEach(async ({ page }) => {
  // The cloud policy blocks the tile provider until settings are applied.
  // Check the explicit failure notice without substituting an inaccurate map.
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByText('Demostración · datos de ejemplo')).toBeAttached();
});

test('mapa, zoom y movimiento de los cuatro vehículos', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('.bus-marker')).toHaveCount(4);
  await expect(page.getByText('Mapa de calles no disponible · solo se muestra el recorrido')).toBeVisible();
  // At overview zoom, five seconds of travel can round to the same screen pixel.
  // Zoom in and let the map animation settle before testing actual bus movement.
  await page.getByRole('button', { name: 'Acercar mapa' }).click();
  await page.getByRole('button', { name: 'Acercar mapa' }).click();
  await page.waitForTimeout(500);
  const marker = page.locator('.bus-marker').first();
  const before = await marker.getAttribute('style');
  await expect.poll(() => marker.getAttribute('style'), { timeout: 10_000 }).not.toBe(before);
  const route = page.locator('.leaflet-overlay-pane path.leaflet-interactive').first();
  const path = await route.getAttribute('d');
  await page.getByRole('button', { name: 'Acercar mapa' }).click();
  await expect.poll(() => route.getAttribute('d')).not.toBe(path);
  await page.getByRole('button', { name: 'Ver recorrido completo' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/pueblabus-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('filtra por sentido, busca y selecciona un autobús', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await page.getByLabel('Sentido del recorrido').selectOption('outbound');
  await expect(page.locator('.vehicle-card')).toHaveCount(2);
  await page.getByRole('searchbox').fill('PB-101');
  await expect(page.locator('.vehicle-card')).toHaveCount(1);
  await page.locator('.vehicle-card').click();
  await expect(page.locator('.vehicle-card')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await page.getByRole('searchbox').fill('inexistente');
  await expect(page.getByText('No hay autobuses para mostrar')).toBeVisible();
});

test('guarda una parada, persiste favoritos y abre su detalle', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await page.getByRole('tab', { name: 'Paradas' }).click();
  await page.getByRole('searchbox').fill('puebla');
  await expect(page.locator('.stop-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Guardar La Puebla · Centro', exact: true }).click();
  await page.reload();
  await page.locator('.main-nav').getByRole('button', { name: 'Mis paradas' }).click();
  await expect(page.locator('.stop-card')).toHaveCount(1);
  await page.locator('.stop-main').click();
  await expect(page.getByRole('heading', { name: 'La Puebla · Centro' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pasos de ejemplo' })).toBeVisible();
});

test('consulta horarios por fecha y sentido y explica los datos', async ({ page }) => {
  await page.locator('.main-nav').getByRole('button', { name: 'Horarios' }).click();
  await page.getByLabel('Sentido del recorrido').selectOption('outbound');
  await page.getByLabel('Fecha del viaje').fill('2026-11-02');
  await expect(page.locator('.schedule-row')).toHaveCount(10);
  await page.getByLabel('Fecha del viaje').fill('2026-11-08');
  await expect(page.locator('.schedule-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Información sobre los datos' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('no representan vehículos reales.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('un fallo de red conserva los datos y muestra el aviso', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await page.route('**/api/transit', route => route.abort());
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.vehicle-card')).toHaveCount(4);
});

test('una fuente real no disponible no se presenta como demo ni como conectada', async ({ page }, info) => {
  await page.route('**/api/transit', route => route.fulfill({ status: 503, json: { mode: 'live', status: 'unavailable', data: null, message: 'No se ha podido conectar con el operador.' } }));
  await page.reload();
  await expect(page.getByText('SIN DATOS', { exact: true })).toBeAttached();
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await expect(page.getByRole('complementary', { name: 'Consulta de transporte' }).getByText('No se ha podido conectar con el operador.')).toBeVisible();
  await expect(page.locator('.bus-marker')).toHaveCount(0);
  await expect(page.getByText('Demostración · datos de ejemplo')).toHaveCount(0);
  await page.unroute('**/api/transit');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('Demostración · datos de ejemplo')).toBeVisible();
});

test('los horarios importados muestran su calendario sin simular vehículos GPS', async ({ page }) => {
  // Synthetic response to test the scheduled UI, not an official downloaded feed.
  const data = createDemo(new Date('2026-11-02T12:00:00Z'));
  data.vehicles = [];
  data.journeys = [{ id: 'fixture-trip', routeId: 'outbound', serviceId: 'fixture-service', departure: '23:40:00', arrival: '24:55:00', stopTimes: data.stops.map((s, i) => ({ stopId: s.id, time: i === 0 ? '23:40:00' : '24:55:00' })) }];
  data.calendar = [{ id: 'fixture-service', start: '2026-01-01', end: '2026-12-31', days: [true, true, true, true, true, true, true] }];
  data.exceptions = [{ serviceId: 'fixture-service', date: '2026-11-03', added: false }];
  data.source = { name: 'Synthetic test fixture', url: 'https://example.invalid/gtfs.zip', fetchedAt: data.updatedAt, validUntil: '2026-12-31' };
  await page.route('**/api/transit', route => route.fulfill({ json: { mode: 'scheduled', status: 'ok', message: 'Horarios programados, sin GPS.', data } }));
  await page.reload();
  await expect(page.getByText('SIN GPS', { exact: true })).toBeAttached();
  await expect(page.locator('.bus-marker')).toHaveCount(0);
  await page.locator('.main-nav').getByRole('button', { name: 'Horarios' }).click();
  await page.getByLabel('Sentido del recorrido').selectOption('outbound');
  await page.getByLabel('Fecha del viaje').fill('2026-11-02');
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await expect(page.locator('.schedule-row')).toContainText('00:55 (+1)');
  await page.getByLabel('Fecha del viaje').fill('2026-11-03');
  await expect(page.locator('.schedule-row')).toHaveCount(0);
  await expect(page.getByText('No hay salidas publicadas para esta fecha.')).toBeVisible();
});
