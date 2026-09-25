const { test, expect } = require('@playwright/test');
const { loginBrowser, loginRequest } = require('./auth.cjs');
const { expectPanViewer } = require('./plan.cjs');
const base = '/odata/v4/booking/';

async function chooseFloor(page, name) {
  await page.getByRole('combobox', { name: 'Floor', exact: true }).press('Space');
  await page.getByRole('option', { name, exact: true }).click();
}

for (const [route, type, areaType] of [['spaces', 'WORKPLACE', 'DESK'], ['rooms', 'ROOM', 'ZONE']]) {
  test(`${route}: select an unlinked area, set up booking and reserve as a regular user`, async ({ page, request }) => {
    const errors = [];page.on('pageerror', error => errors.push(error.message));
    await loginBrowser(page, request);
    const floorResponse = await request.post(base + 'Floors', { data: { building_ID: '30000000-0000-4000-8000-000000000001', code: 'SELECT-' + type, name: 'Selection floor ' + type } });
    expect(floorResponse.ok(), await floorResponse.text()).toBe(true);
    const floor = await floorResponse.json();
    const response = await request.post(base + 'FloorObjects', { data: { floor_ID: floor.ID, name: 'Selection area ' + type, type: areaType, x: 350, y: 160, width: 180, height: 100 } });
    expect(response.ok(), await response.text()).toBe(true);
    const area = await response.json();
    try {
      // Even a floor with areas but no resources must show a selectable plan.
      await loginBrowser(page, request, 'ola@example.com');
      await page.goto('/#' + route);await chooseFloor(page, floor.name);
      await expectPanViewer(page, area.ID);
      await page.getByRole('button', { name: area.name + ', Booking not configured', exact: true }).click();
      await expect(page.locator('.detailPane')).toContainText('Ask an administrator');
      await expect(page.getByRole('button', { name: 'Set up booking', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Reserve', exact: true })).toHaveCount(0);

      await loginBrowser(page, request);
      await page.reload();await chooseFloor(page, floor.name);
      await page.getByRole('button', { name: area.name + ', Booking not configured', exact: true }).press('Enter');
      await expect(page.locator(`[data-object="${area.ID}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Set up booking', exact: true }).click();
      const setup = page.getByRole('dialog', { name: 'Set up booking', exact: true });
      await expect(setup.getByLabel('Name', { exact: true })).toHaveValue(area.name);
      await setup.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(setup).not.toBeVisible();
      const linked = await (await request.get(base + `FloorObjects(${area.ID})`)).json();
      expect(linked.resource_ID).toBeTruthy();
      const resource = await (await request.get(base + `Resources(${linked.resource_ID})`)).json();
      expect(resource.type).toBe(type);expect(resource.floor_ID).toBe(floor.ID);

      await loginBrowser(page, request, 'ola@example.com');
      await page.reload();await chooseFloor(page, floor.name);
      await expectPanViewer(page, area.ID);
      await page.getByRole('button', { name: area.name + ', Available', exact: true }).click();
      await page.getByRole('button', { name: 'Reserve', exact: true }).click();
      const booking = page.getByRole('dialog');
      await expect(booking.getByRole('combobox', { name: 'Resource', exact: true })).toContainText(resource.name);
      await booking.getByLabel('Title', { exact: true }).fill('Area selection reservation ' + type);
      await booking.getByRole('button', { name: 'Reserve', exact: true }).click();
      await expect(booking).not.toBeVisible();
      const bookings = (await (await request.get(base + 'Bookings')).json()).value.filter(row => row.resource_ID === resource.ID);
      expect(bookings).toHaveLength(1);
      expect(bookings[0].user_ID).toBe('60000000-0000-4000-8000-000000000003');
      await request.delete(base + `Bookings(${bookings[0].ID})`);

      // The selector also works without clicking a shape, in plan and list views.
      await page.reload();await chooseFloor(page, floor.name);
      await page.getByRole('combobox', { name: 'Resource', exact: true }).press('Space');
      await page.getByRole('option', { name: resource.name + ' · Available', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Reserve', exact: true })).toBeEnabled();
      await page.getByRole('option', { name: 'List', exact: true }).click();
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await page.getByRole('button', { name: 'Reserve', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Resource', exact: true })).toContainText(resource.name);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(errors).toEqual([]);
    } finally {
      await loginRequest(request, 'anna@example.com');
      const resources = (await (await request.get(base + 'Resources')).json()).value.filter(row => row.floor_ID === floor.ID);
      const bookings = (await (await request.get(base + 'Bookings')).json()).value.filter(row => resources.some(resource => resource.ID === row.resource_ID));
      for (const row of bookings) await request.delete(base + `Bookings(${row.ID})`);
      await request.delete(base + `FloorObjects(${area.ID})`);
      for (const row of resources) await request.delete(base + `Resources(${row.ID})`);
      await request.delete(base + `Floors(${floor.ID})`);
    }
  });
}

test('link an area to an existing room without creating a duplicate resource', async ({ page, request }) => {
  await loginBrowser(page, request);
  const resourceID = '50000000-0000-4000-8000-000000000001';
  const response = await request.post(base + 'FloorObjects', { data: { floor_ID: '40000000-0000-4000-8000-000000000001', name: 'Existing room area', type: 'ZONE', x: 400, y: 80 } });
  expect(response.ok(), await response.text()).toBe(true);
  const area = await response.json();
  const before = (await (await request.get(base + 'Resources')).json()).value.length;
  try {
    await page.goto('/#rooms');
    await page.getByRole('button', { name: area.name + ', Booking not configured', exact: true }).click();
    await page.getByRole('button', { name: 'Set up booking', exact: true }).click();
    const setup = page.getByRole('dialog', { name: 'Set up booking', exact: true });
    await setup.getByRole('combobox', { name: 'Linked resource', exact: true }).locator('..').click();
    await page.getByRole('option', { name: 'Hannover Meeting Room', exact: true }).click();
    await expect(setup.getByLabel('Code', { exact: true })).not.toBeVisible();
    await setup.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(setup).not.toBeVisible();
    expect((await (await request.get(base + `FloorObjects(${area.ID})`)).json()).resource_ID).toBe(resourceID);
    expect((await (await request.get(base + 'Resources')).json()).value).toHaveLength(before);
    await expect(page.locator(`[data-object="resource-${resourceID}"]`)).toHaveCount(0);
    await page.getByRole('button', { name: area.name + ', Available', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reserve', exact: true })).toBeEnabled();
  } finally { await request.delete(base + `FloorObjects(${area.ID})`); }
});
