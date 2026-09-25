const { test, expect } = require('@playwright/test');
const { expectPanViewer } = require('./plan.cjs');
const { loginBrowser, loginRequest } = require('./auth.cjs');
const png = require('../fixtures/plan-image.cjs');
const base = '/odata/v4/booking/';

async function rows(request, entity) { return (await (await request.get(base + entity)).json()).value; }
async function saveEntry(page, code, name) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill(code);
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function removeLot(request, lotID) {
  if (!lotID) return;
  await loginRequest(request, 'anna@example.com');
  const levels = (await rows(request, 'Floors')).filter(row => row.building_ID === lotID);
  const spaces = (await rows(request, 'Resources')).filter(row => levels.some(level => level.ID === row.floor_ID));
  const bookings = (await rows(request, 'Bookings')).filter(row => spaces.some(space => space.ID === row.resource_ID));
  const areas = (await rows(request, 'FloorObjects')).filter(row => levels.some(level => level.ID === row.floor_ID));
  for (const [entity, data] of [['Bookings', bookings], ['FloorObjects', areas], ['Resources', spaces], ['Floors', levels], ['Buildings', [{ ID: lotID }]]]) {
    for (const row of data) expect((await request.delete(base + `${entity}(${row.ID})`)).status()).toBe(204);
  }
}

test('create a parking lot and level only in Administration, reserve a space as a user, edit and cancel', async ({ page, request }) => {
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  await loginBrowser(page, request);
  let lot;
  try {
    await page.goto('/parking');
    await expect(page.getByRole('heading', { name: 'Parking', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add parking lot', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add parking level', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Administration', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add parking lot', exact: true }).click();
    await saveEntry(page, 'P-UI', 'Browser parking lot');
    lot = (await rows(request, 'Buildings')).find(row => row.code === 'P-UI');
    expect(lot.kind).toBe('PARKING');
    await page.getByRole('row').filter({ hasText: lot.name }).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Parking lot', exact: true })).toContainText(lot.name);
    await expect(page.getByRole('button', { name: 'Add parking lot', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add parking level', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Administration', exact: true }).click();
    await page.getByRole('row').filter({ hasText: lot.name }).getByRole('button', { name: 'Add parking level', exact: true }).click();
    await saveEntry(page, 'G', 'Ground parking');
    const level = (await rows(request, 'Floors')).find(row => row.building_ID === lot.ID);
    await page.getByRole('row').filter({ hasText: lot.name }).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Parking level / zone', exact: true })).toContainText(level.name);
    await expect(page.getByRole('button', { name: 'Add parking lot', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add parking level', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add parking space', exact: true }).click();
    await saveEntry(page, 'P01', 'Browser parking P01');
    const space = (await rows(request, 'Resources')).find(row => row.floor_ID === level.ID);
    expect(space.type).toBe('PARKING');expect(space.capacity).toBe(1);
    await page.getByRole('button', { name: 'Browser parking P01, Available', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reserve', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'test-results/parking-desktop.png', fullPage: true });

    await loginBrowser(page, request, 'ola@example.com');
    await page.goto('/parking-space/' + space.ID);
    await expect(page.getByRole('button', { name: 'Add parking space', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reserve', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Reserve', exact: true });
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Parking reservation');
    await expect(dialog.getByLabel('Attendees', { exact: true })).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Parking space', exact: true }).locator('..').click();
    await expect(page.getByRole('option', { name: 'Hannover Meeting Room', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: space.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const booking = (await rows(request, 'Bookings')).find(row => row.resource_ID === space.ID);
    expect(booking.user_ID).toBe('60000000-0000-4000-8000-000000000003');
    await page.getByRole('button', { name: 'My bookings', exact: true }).first().click();
    let card = page.locator('.bookingCard').filter({ hasText: space.name });
    await card.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('parking-space/' + space.ID));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Updated parking reservation');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'My bookings', exact: true }).first().click();
    card = page.locator('.bookingCard').filter({ hasText: 'Updated parking reservation' });
    await card.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(card).toContainText('Cancelled');

    // Key users retain their permission to delete another employee's parking booking.
    await loginBrowser(page, request, 'max@example.de');
    // Cookie changes made by the test helper need a new document; hash navigation
    // alone leaves the previous profile in the existing controller.
    await page.reload();
    await page.goto('/#bookings');
    await page.getByRole('option', { name: 'All bookings', exact: true }).click();
    await page.locator('.bookingCard').filter({ hasText: 'Updated parking reservation' }).getByRole('button', { name: 'Delete booking', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.locator('.bookingCard').filter({ hasText: 'Updated parking reservation' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await removeLot(request, lot?.ID); }
});

test('plan editor lists parking lots without levels and follows the selected office', async ({ page, request }) => {
  await loginBrowser(page, request);
  const lots = [];
  try {
    for (const [site, name] of [['20000000-0000-4000-8000-000000000001', 'Editor Hannover parking'], ['20000000-0000-4000-8000-000000000002', 'Editor Berlin parking']]) {
      const response = await request.post(base + 'Buildings', { data: { site_ID: site, code: 'EDITOR-LOT', name, kind: 'PARKING' } });
      expect(response.ok(), await response.text()).toBe(true);lots.push(await response.json());
    }
    const [hannover, berlin] = lots;
    const levelResponse = await request.post(base + 'Floors', { data: { building_ID: hannover.ID, code: 'G', name: 'Existing parking level' } });
    expect(levelResponse.ok(), await levelResponse.text()).toBe(true);
    await page.goto('/floor-editor/40000000-0000-4000-8000-000000000001');
    await page.getByRole('combobox', { name: 'Floor', exact: true }).press('Space');
    await expect(page.getByRole('option', { name: 'Hannover Building A · Demo office floor', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Parking · Editor Hannover parking · Existing parking level', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Parking · Editor Berlin parking', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('combobox', { name: 'Office', exact: true }).press('Space');
    await page.getByRole('option', { name: 'Berlin Office', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Floor', exact: true })).toContainText('Berlin Building A');
    await page.getByRole('combobox', { name: 'Floor', exact: true }).press('Space');
    await expect(page.getByRole('option', { name: 'Parking · Editor Hannover parking · Existing parking level', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Parking · Editor Berlin parking', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('floor-editor/' + berlin.ID));
    await expect(page.getByRole('heading', { name: 'No parking levels or zones yet', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Office', exact: true })).toContainText('Berlin Office');
    await expect(page.getByRole('combobox', { name: 'Floor', exact: true })).toContainText('Parking · Editor Berlin parking');
    await expect(page.getByRole('button', { name: 'Add parking level', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Administration', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
    await page.getByRole('row').filter({ hasText: berlin.name }).getByRole('button', { name: 'Add parking level', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Parking lot', exact: true })).toContainText(berlin.name);
    await saveEntry(page, 'G', 'Ground zone');
    await page.locator('.adminToolbar .sapMSlt').click();
    await page.getByRole('option', { name: 'Parking levels / zones', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add parking level', exact: true })).toBeEnabled();
    await page.getByRole('row').filter({ hasText: 'Ground zone' }).getByRole('button', { name: 'Open floor editor', exact: true }).click();
    await expect(page.getByLabel('Upload / replace JPG, PNG or SVG')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Floor', exact: true })).toContainText('Parking · Editor Berlin parking · Ground zone');
    const levels = (await rows(request, 'Floors')).filter(row => row.building_ID === berlin.ID);
    expect(levels).toHaveLength(1);
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    expect((await rows(request, 'FloorObjects')).some(row => row.floor_ID === levels[0].ID)).toBe(true);

    await page.getByRole('combobox', { name: 'Language', exact: true }).press('Space');
    await page.getByRole('option', { name: 'German', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Etage', exact: true })).toContainText('Parken · Editor Berlin parking · Ground zone');
  } finally { for (const lot of lots) await removeLot(request, lot.ID); }
});

test('parking plans support area setup, separate administration, German and mobile booking', async ({ page, request }) => {
  await loginBrowser(page, request);
  const lot = await (await request.post(base + 'Buildings', { data: { site_ID: '20000000-0000-4000-8000-000000000001', code: 'PLAN-PARK', name: 'Plan parking lot', kind: 'PARKING' } })).json();
  try {
    const level = await (await request.post(base + 'Floors', { data: { building_ID: lot.ID, code: 'L1', name: 'Parking level 1' } })).json();
    await page.goto('/parking-lot/' + lot.ID);
    await page.getByRole('button', { name: 'Open floor editor', exact: true }).click();
    await page.getByLabel('Upload / replace JPG, PNG or SVG').setInputFiles({ name: 'parking.png', mimeType: 'image/png', buffer: png(1000, 600) });
    await expect(page.locator('.planWorld > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    await page.getByRole('button', { name: 'Fit to screen', exact: true }).click();
    await page.getByRole('button', { name: 'Draw rectangle', exact: true }).click();
    const box = await page.locator('.planViewport').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 150);await page.mouse.down();
    await page.mouse.move(box.x + 240, box.y + 260, { steps: 8 });await page.mouse.up();
    await page.getByLabel('Name', { exact: true }).fill('Parking area P02');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Parking area P02', exact: true })).toBeVisible();
    const area = (await rows(request, 'FloorObjects')).find(row => row.floor_ID === level.ID);
    await page.getByRole('button', { name: 'Parking', exact: true }).first().click();
    await expect(page.locator('.planWorld > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    await expectPanViewer(page, area.ID);
    await page.getByRole('button', { name: area.name + ', Booking not configured', exact: true }).click();
    await page.getByRole('button', { name: 'Set up booking', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Set up booking', exact: true });
    await expect(dialog.getByRole('combobox', { name: 'Type', exact: true })).toContainText('Parking space');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const linked = await (await request.get(base + `FloorObjects(${area.ID})`)).json();
    const space = await (await request.get(base + `Resources(${linked.resource_ID})`)).json();
    expect(linked.type).toBe('PARKING');expect(space.type).toBe('PARKING');
    await page.getByRole('button', { name: 'Open floor editor', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('floor-editor/' + level.ID));
    await expect(page.getByRole('button', { name: area.name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Administration', exact: true }).click();
    await page.locator('.adminToolbar .sapMSlt').click();
    await page.getByRole('option', { name: 'Parking lots', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: lot.name })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Hannover Building A' })).toHaveCount(0);
    for (const section of ['Parking levels / zones', 'Parking spaces']) {
      await page.locator('.adminToolbar .sapMSlt').click();
      await page.getByRole('option', { name: section, exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: section === 'Parking spaces' ? space.name : level.name })).toBeVisible();
    }
    for (const route of ['spaces', 'rooms']) {
      await page.goto('/#' + route);
      await page.getByRole('combobox', { name: 'Building', exact: true }).press('Space');
      await expect(page.getByRole('option', { name: lot.name, exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator(`[data-object="${area.ID}"]`)).toHaveCount(0);
    }

    await loginBrowser(page, request, 'ola@example.com');
    await page.goto('/parking-space/' + space.ID);
    await page.getByRole('button', { name: area.name + ', Available', exact: true }).click();
    await page.getByRole('button', { name: 'Reserve', exact: true }).click();
    await page.getByRole('dialog', { name: 'Reserve', exact: true }).getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Reserve', exact: true })).not.toBeVisible();
    const mappedBooking = (await rows(request, 'Bookings')).find(row => row.resource_ID === space.ID);
    expect(mappedBooking.user_ID).toBe('60000000-0000-4000-8000-000000000003');
    await request.delete(base + `Bookings(${mappedBooking.ID})`);
    await page.reload();
    await page.getByRole('combobox', { name: 'Language', exact: true }).press('Space');
    await page.getByRole('option', { name: 'German', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Parken', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Parkanlage', exact: true })).toContainText(lot.name);
    await page.setViewportSize({ width: 390, height: 844 });await page.reload();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Reservieren', exact: true }).click();
    const reserve = page.getByRole('dialog', { name: 'Reservieren', exact: true });
    await expect(reserve.getByLabel('Titel', { exact: true })).toHaveValue('Stellplatzreservierung');
    await expect(reserve.getByRole('combobox', { name: 'Stellplatz', exact: true })).toContainText(space.name);
    await reserve.getByRole('button', { name: 'Reservieren', exact: true }).click();
    await expect(reserve).not.toBeVisible();
    expect((await rows(request, 'Bookings')).some(row => row.resource_ID === space.ID)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: 'test-results/parking-mobile-de.png', fullPage: true });
  } finally { await removeLot(request, lot.ID); }
});
