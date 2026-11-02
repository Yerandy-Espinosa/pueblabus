import { expect, test } from '@playwright/test';
import { corridorTestFeed, testGps, testNow } from '../fixtures/transit';

test('recorta M-143 en La Puebla, colorea ambos sentidos y mantiene la ruta anclada al mapa al ampliar', async ({ page }, info) => {
  const feed = corridorTestFeed();
  const puebla = feed.stops[1].position;
  const world = (point: [number, number], zoom: number) => {
    const size = 256 * 2 ** zoom, latitude = point[0] * Math.PI / 180;
    return [(point[1] + 180) / 360 * size, (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * size];
  };
  // Georeferenced synthetic street tiles, independent of Leaflet's projection.
  // These fixtures only exist in tests; no substitute cartography is deployed.
  await page.route('https://tile.openstreetmap.org/**', route => {
    const [, z, x, y] = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url())!;
    const points = feed.routes[0].shape.map(p => { const [px, py] = world(p, Number(z)); return `${px - Number(x) * 256},${py - Number(y) * 256}`; }).join(' ');
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f3f4f0"/><polyline points="${points}" fill="none" stroke="#a8a29e" stroke-width="12"/></svg>` });
  });
  await page.clock.install({ time: testNow });
  const gps = { ...testGps(feed), position: [37.267, -6.062] as [number, number] };
  await page.route('**/api/transit', route => route.fulfill({ json: { mode: 'live', status: 'ok', message: 'Fixture GPS', data: { ...feed, vehicles: [gps, { ...gps, id: 'test-return', routeId: feed.routes[1].id, position: feed.stops[2].position }] } } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La Puebla del Río ↔ Sevilla' })).toBeVisible();
  await expect(page.locator('.bus-pin').first()).toHaveCSS('background-color', 'rgb(21, 128, 61)');
  await expect(page.locator('.bus-pin').nth(1)).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  await expect(page.locator('.stop-marker[title^="Test Isla"]')).toHaveCount(0);
  const shared = page.locator('.stop-marker[title^="Test Los Juncales"]');
  await expect(shared.locator('[stroke="#15803d"]')).toHaveCount(1);
  await expect(shared.locator('[stroke="#dc2626"]')).toHaveCount(1);
  await expect(page.locator('path.route-path').first()).toHaveAttribute('stroke', '#f59e0b');
  await expect(page.locator('.leaflet-image-layer')).toHaveCount(0);

  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await page.getByLabel('Sentido del recorrido').selectOption(feed.routes[1].id);
  await expect(shared.locator('circle[stroke="#dc2626"]')).toHaveCount(1);
  await expect(shared.locator('[stroke="#15803d"]')).toHaveCount(0);
  await page.getByLabel('Sentido del recorrido').selectOption(feed.routes[0].id);
  await expect(shared.locator('circle[stroke="#15803d"]')).toHaveCount(1);
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Mapa', exact: true }).click();
  await shared.click();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Ver parada en el mapa' }).click();
  await page.waitForTimeout(800);

  for (let step = 0; step < 3; step++) {
    if (step) {
      await page.getByRole('button', { name: 'Acercar mapa' }).click();
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: 'Acercar mapa' }).click();
    }
    await page.waitForTimeout(500);
    const alignment = await page.evaluate(point => {
      const path = document.querySelector<SVGPathElement>('path.route-path')!;
      const local = path.getPointAtLength(0);
      const route = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM()!);
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded'));
      const tile = images.sort((a, b) => Number(/\/(\d+)\/\d+\/\d+\.png/.exec(b.src)![1]) - Number(/\/(\d+)\/\d+\/\d+\.png/.exec(a.src)![1]))[0];
      const [, zoom, x, y] = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(tile.src)!;
      const size = 256 * 2 ** Number(zoom), latitude = point[0] * Math.PI / 180;
      const tileRect = tile.getBoundingClientRect();
      const px = tileRect.left + (point[1] + 180) / 360 * size - Number(x) * 256;
      const py = tileRect.top + (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * size - Number(y) * 256;
      const stop = document.querySelector('.stop-marker[title^="Test Los Juncales"]')!.getBoundingClientRect();
      return { zoom: Number(zoom), routeError: Math.hypot(route.x - px, route.y - py), stopError: Math.hypot(stop.left + stop.width / 2 - px, stop.top + stop.height / 2 - py) };
    }, puebla);
    expect(alignment.routeError).toBeLessThan(1.5);
    expect(alignment.stopError).toBeLessThan(1.5);
    expect(alignment.zoom).toBe(13 + step * 2);
  }
  await page.screenshot({ path: `test-results/map-alignment-${info.project.name}.png` });
});
