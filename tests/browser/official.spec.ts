import { expect, test } from '@playwright/test';
import { testFeed, testGps, testNow } from '../fixtures/transit';
import type { Snapshot } from '../../src/transit';

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', r => r.abort());
  await page.clock.install({ time: testNow });
});

test('prioriza GPS, avisa al pasar a estimación sin conexión y recupera GPS', async ({ page }, info) => {
  const feed = testFeed();
  let online = true;
  let measured = testNow;
  await page.route('**/api/transit', route => {
    if (!online) return route.abort();
    const gps = testGps(feed, measured);
    const snapshot: Snapshot = { mode: 'live', status: 'ok', message: 'GPS de prueba', data: { ...feed, updatedAt: measured.toISOString(), vehicles: [gps, { ...gps, id: 'ctas:test-return', label: 'Test return', routeId: feed.routes[1].id }] } };
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Autobuses' }).click();
  await expect(page.locator('.position-kind')).toHaveCount(2);
  await expect(page.locator('.position-kind.estimate')).toHaveCount(0);
  await expect(page.locator('.arrival').first()).toContainText('sin ETA publicada');

  online = false;
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.position-kind.estimate')).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText('Sin conexión');
  if (info.project.name === 'mobile') await page.locator('.mobile-view-switch').getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.locator('.floating-tag')).toHaveText('ESTIMADA');
  await expect(page.locator('.estimated-pin')).toHaveCount(2);
  const before = await page.locator('.bus-marker').first().getAttribute('style');
  await page.clock.runFor(31_000);
  await expect.poll(() => page.locator('.bus-marker').first().getAttribute('style')).not.toBe(before);
  await page.screenshot({ path: `test-results/official-estimated-${info.project.name}.png` });

  measured = new Date(await page.evaluate(() => Date.now()));
  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.floating-tag')).toHaveText('EN DIRECTO');
  await expect(page.locator('.estimated-pin')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('excluye M-141 en festivo y consulta las salidas oficiales de una parada', async ({ page }, info) => {
  const feed = testFeed();
  feed.holidays = ['2026-11-02'];
  feed.routes[0] = { ...feed.routes[0], shortName: 'M-141', operatesOnWeekends: false, operatesOnHolidays: false };
  feed.routes[1] = { ...feed.routes[1], shortName: 'M-140' };
  await page.route('**/api/transit', r => r.fulfill({ json: { mode: 'estimated', status: 'ok', message: 'Sin GPS de prueba', data: feed } }));
  await page.route('**/api/departures?*', r => r.fulfill({ json: { stopId: 'ctan:1_100', status: 'ok', checkedAt: testNow.toISOString(), from: '2026-11-02 10:15', until: '2026-11-02 11:15', message: 'Horario programado', sourceLabel: 'Calendario oficial de festivos', departures: [{ id: 'test', line: 'M-140', destination: 'SEVILLA', time: '10:30', date: '2026-11-02', inMinutes: 15, boarding: true, scheduled: true }] } }));
  await page.goto('/');
  await page.locator('.main-nav').getByRole('button', { name: 'Horarios' }).click();
  await page.getByLabel('Sentido del recorrido').selectOption(feed.routes[0].id);
  await expect(page.getByText('FESTIVO · Se aplica', { exact: false })).toBeVisible();
  await expect(page.locator('.schedule-row')).toHaveCount(0);
  await page.getByLabel('Fecha del viaje').fill('2026-11-03');
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Paradas' }).click();
  await page.locator('.stop-main').first().click();
  await expect(page.getByRole('heading', { name: 'Próximas salidas · CTAN' })).toBeVisible();
  await expect(page.locator('.departure-board-row')).toContainText('10:30');
  await expect(page.locator('.departure-board-note')).toContainText('No son predicciones GPS');
});
