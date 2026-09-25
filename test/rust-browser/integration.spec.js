const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { loginBrowser, loginRequest } = require('../browser/auth.cjs');
const png = require('../fixtures/plan-image.cjs');
const base = '/odata/v4/booking/';

async function create(request, entity, data) {
  const response = await request.post(base + entity, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function rows(request, entity) {
  const result = [];let next = entity;
  while (next) {
    const response = await request.get(base + next);expect(response.ok(), await response.text()).toBe(true);
    const data = await response.json();result.push(...data.value);next = data['@odata.nextLink'];
  }
  return result;
}
async function cleanup(request, owned) {
  await loginRequest(request, 'anna@example.com');
  const floorIDs = owned.filter(row => row.entity === 'Floors').map(row => row.ID);
  const spaces = (await rows(request, 'Resources')).filter(row => floorIDs.includes(row.floor_ID));
  const bookings = (await rows(request, 'Bookings')).filter(row => spaces.some(space => space.ID === row.resource_ID));
  const objects = (await rows(request, 'FloorObjects')).filter(row => floorIDs.includes(row.floor_ID));
  const displays = (await rows(request, 'Displays')).filter(row => spaces.some(space => space.ID === row.resource_ID));
  for (const [entity, entries] of [['Bookings', bookings], ['Displays', displays], ['FloorObjects', objects], ['Resources', spaces], ['Floors', owned.filter(row => row.entity === 'Floors')], ['Buildings', owned.filter(row => row.entity === 'Buildings')]]) {
    for (const row of entries) expect((await request.delete(base + `${entity}(${row.ID})`)).status()).toBe(204);
  }
  await request.post('/auth/logout', { data: {} });
}
async function reserve(page, title) {
  await page.getByRole('button', { name: 'Reserve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reserve', exact: true });
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('Rust profiles support English/German login, role switching and logout in the browser', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('rsvroom.language')) localStorage.setItem('rsvroom.language', 'en'); });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Employee', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Ola Example · User', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for a good day.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0);
  for (const [current, next, role] of [['Ola Example', 'Max Example', 'Key user'], ['Max Example', 'Anna Example', 'Administrator']]) {
    await page.getByRole('button', { name: current, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Employee', exact: true }).locator('..').click();
    await page.getByRole('option', { name: `${next} · ${role}`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('button', { name: next, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'People', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(role === 'Administrator' ? 1 : 0);
  }
  await page.getByRole('combobox', { name: 'Language', exact: true }).press('Space');
  await page.getByRole('option', { name: 'German', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Platz für einen guten Tag.' })).toBeVisible();
  await page.getByRole('button', { name: 'Anna Example', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Mitarbeiter', exact: true })).toBeVisible();
});

test('Rust room and desk bookings can be created, edited and cancelled through the frontend', async ({ page, request }) => {
  await loginBrowser(page, request);
  const owned = [], suffix = randomUUID().slice(0, 8);
  try {
    const floor = await create(request, 'Floors', { building_ID: '30000000-0000-4000-8000-000000000001', code: 'UI-' + suffix, name: 'UI integration ' + suffix });
    owned.push({ entity: 'Floors', ID: floor.ID });
    const resources = [];
    for (const type of ['ROOM', 'WORKPLACE']) resources.push(await create(request, 'Resources', { floor_ID: floor.ID, type, code: type + suffix, name: type + ' integration ' + suffix, capacity: type === 'ROOM' ? 4 : 1 }));
    await loginBrowser(page, request, 'ola@example.com');
    for (const resource of resources) {
      await page.goto('/' + (resource.type === 'ROOM' ? 'room' : 'desk') + '/' + resource.ID);
      await expect(page.getByRole('heading', { name: resource.name, exact: true })).toBeVisible();
      await reserve(page, 'Integration booking ' + resource.code);
      const booking = (await rows(request, 'Bookings')).find(row => row.resource_ID === resource.ID);
      expect(booking.user_ID).toBe('60000000-0000-4000-8000-000000000003');
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
      await dialog.getByLabel('Title', { exact: true }).fill('Updated integration ' + resource.code);
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await page.getByRole('button', { name: 'My bookings', exact: true }).first().click();
      const card = page.locator('.bookingCard').filter({ hasText: 'Updated integration ' + resource.code });
      await card.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
      await expect(card).toContainText('Cancelled');
    }
  } finally { await cleanup(request, owned); }
});

test('Rust parking plan upload, atomic area setup and booking work through the frontend', async ({ page, request }) => {
  await loginBrowser(page, request);
  const owned = [], suffix = randomUUID().slice(0, 8);
  try {
    const lot = await create(request, 'Buildings', { site_ID: '20000000-0000-4000-8000-000000000001', kind: 'PARKING', code: 'UI-' + suffix, name: 'Integration parking ' + suffix });
    owned.push({ entity: 'Buildings', ID: lot.ID });
    const floor = await create(request, 'Floors', { building_ID: lot.ID, code: 'G', name: 'Integration parking level' });
    owned.push({ entity: 'Floors', ID: floor.ID });
    await page.goto('/floor-editor/' + floor.ID);
    await page.getByLabel('Upload / replace JPG, PNG or SVG').setInputFiles({ name: 'parking.png', mimeType: 'image/png', buffer: png(1000, 600) });
    await expect(page.locator('.planWorld > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    const areas = (await rows(request, 'FloorObjects')).filter(row => row.floor_ID === floor.ID);
    expect(areas).toHaveLength(1);
    await page.locator('.planViewport').focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByLabel('X coordinate', { exact: true })).toHaveValue(String(Number(areas[0].x) + 10));
    await expect.poll(async () => Number((await rows(request, 'FloorObjects')).find(row => row.ID === areas[0].ID).x)).toBe(Number(areas[0].x) + 10);
    await expect(page.locator('.sapUiLocalBusyIndicator:visible')).toHaveCount(0);
    await page.getByRole('button', { name: 'Parking', exact: true }).first().click();
    await page.getByRole('button', { name: areas[0].name + ', Booking not configured', exact: true }).click();
    await page.getByRole('button', { name: 'Set up booking', exact: true }).click();
    await page.getByRole('dialog', { name: 'Set up booking', exact: true }).getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const resource = (await rows(request, 'Resources')).find(row => row.floor_ID === floor.ID);
    expect(resource.type).toBe('PARKING');
    await loginBrowser(page, request, 'ola@example.com');
    await page.goto('/parking-space/' + resource.ID);
    await reserve(page, 'Integration parking ' + suffix);
    const booking = (await rows(request, 'Bookings')).find(row => row.resource_ID === resource.ID);
    expect(booking.user_ID).toBe('60000000-0000-4000-8000-000000000003');
    await page.screenshot({ path: 'test-results/rust-parking.png', fullPage: true });
    await loginRequest(request, 'anna@example.com');
    const device = await create(request, 'Displays', { resource_ID: resource.ID, name: 'Integration display ' + suffix, deviceId: 'ui-' + suffix });
    const provision = await request.post(base + 'provisionDevice', { data: { deviceID: device.ID } });
    expect(provision.ok(), await provision.text()).toBe(true);
    const token = (await provision.json()).value;
    expect(typeof token).toBe('string');
    await page.context().clearCookies();
    await page.goto('/display/parking/' + resource.ID + '?' + new URLSearchParams({ device: device.ID, token }));
    await expect(page.getByRole('heading', { name: resource.name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0);
  } finally { await cleanup(request, owned); }
});
