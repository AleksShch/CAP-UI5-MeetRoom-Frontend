const { test, expect } = require('@playwright/test');
const { loginBrowser } = require('./auth.cjs');
const { geometry } = require('./plan.cjs');
test.beforeEach(async ({ page, request }) => { await loginBrowser(page, request); });
const png = require('../fixtures/plan-image.cjs');
const user = '60000000-0000-4000-8000-000000000001';
test('image editor draws, moves, resizes, links and removes areas independently from resources', async ({ page, request }) => {
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  const floorResponse = await request.post('/odata/v4/booking/Floors', { data: { building_ID: '30000000-0000-4000-8000-000000000001', code: 'EDITOR-TEST', name: 'First Floor' } });
  expect(floorResponse.ok(), await floorResponse.text()).toBe(true);
  const floor = await floorResponse.json();
  const roomResponse = await request.post('/odata/v4/booking/Resources', { data: { floor_ID: floor.ID, type: 'ROOM', code: 'EDITOR-ROOM', name: 'Editor test meeting room', capacity: 8 } });
  expect(roomResponse.ok(), await roomResponse.text()).toBe(true);
  const room = await roomResponse.json();
  await page.addInitScript(user => { localStorage.setItem('rsvroom.user', user);localStorage.setItem('rsvroom.language', 'en'); }, user);
  await page.goto('/floor-editor/' + floor.ID);
  await expect(page).toHaveURL(/floor-editor\//);
  await expect(page.getByRole('heading', { name: 'Plan editor', exact: true })).toBeVisible();
  await page.getByLabel('Upload / replace JPG, PNG or SVG').setInputFiles({ name: 'floor.png', mimeType: 'image/png', buffer: png(1000, 600) });
  await expect(page.getByText('Original plan: 1000 × 600 px')).toBeVisible();
  await expect(page.locator('.planWorld > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Fit to screen', exact: true }).click();
  await page.getByRole('button', { name: 'Draw rectangle', exact: true }).click();
  const viewport = page.locator('.planViewport');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 130);await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + 230, { steps: 10 });await page.mouse.up();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('HBAFF1');
  await page.getByLabel('Name', { exact: true }).fill('Editor meeting area');
  await page.getByRole('combobox', { name: 'Linked resource', exact: true }).press('Space');
  await page.getByRole('option', { name: room.name, exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editor meeting area', exact: true })).toBeVisible();
  const areas = async () => (await (await request.get('/odata/v4/booking/FloorObjects')).json()).value.filter(row => row.floor_ID === floor.ID);
  // The view updates optimistically; wait for the model's write to commit.
  let created;
  await expect.poll(async () => {
    created = (await areas()).find(row => row.name === 'Editor meeting area');
    return created?.name;
  }).toBe('Editor meeting area');
  expect(created.type).toBe('ROOM');expect(created.resource_ID).toBeTruthy();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const beforeZoom = await areas();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  expect(await areas()).toEqual(beforeZoom);
  const shape = page.locator(`[data-object="${created.ID}"] .objectShape`);
  let shapeBox = await shape.boundingBox();
  await page.mouse.move(shapeBox.x + 25, shapeBox.y + 25);await page.mouse.down();await page.mouse.move(shapeBox.x + 65, shapeBox.y + 45, { steps: 10 });await page.mouse.up();
  await expect.poll(async () => Number((await areas()).find(row => row.ID === created.ID).x)).toBeGreaterThan(Number(created.x));
  const moved = (await areas()).find(row => row.ID === created.ID);
  // Coordinates and resize handles follow the move without rebuilding the SVG.
  await expect(shape.locator('..')).toHaveAttribute('transform', `translate(${moved.x},${moved.y})`);
  await expect(page.locator('.sapUiLocalBusyIndicator:visible')).toHaveCount(0);
  const handle = page.locator(`[data-object="${created.ID}"] [data-handle="se"]`);
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);await page.mouse.down();await page.mouse.move(handleBox.x + 45, handleBox.y + 35, { steps: 10 });await page.mouse.up();
  await expect.poll(async () => Number((await areas()).find(row => row.ID === created.ID).width)).toBeGreaterThan(Number(moved.width));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Plan editor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editor meeting area', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate area', exact: true }).click();
  await expect(page.getByRole('button', { name: 'HBAFF2', exact: true })).toBeVisible();
  expect((await areas()).find(row => row.name === 'HBAFF2').resource_ID).toBeNull();
  await page.getByRole('button', { name: 'Meeting rooms', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Editor meeting area, Available', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editor meeting area, Available', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reserve', exact: true })).toBeVisible();
  for (const row of await areas()) await request.delete(`/odata/v4/booking/FloorObjects(${row.ID})`);
  await request.patch(`/odata/v4/booking/Floors(${created.floor_ID})`, { data: { planImage: null, planImageName: null } });
  expect((await request.get(`/odata/v4/booking/Resources(${created.resource_ID})`)).ok()).toBe(true);
  await request.delete(`/odata/v4/booking/Resources(${room.ID})`);
  await request.delete(`/odata/v4/booking/Floors(${floor.ID})`);
  expect(errors).toEqual([]);
});

test('moving and resizing remain interactive while coordinates save in the background', async ({ page, request }) => {
  const floor = '40000000-0000-4000-8000-000000000001';
  const created = await request.post('/odata/v4/booking/FloorObjects', { data: { floor_ID: floor, name: 'Autosave test area', x: 100, y: 100, width: 160, height: 100, radius: 8, type: 'ZONE' } });
  expect(created.ok(), await created.text()).toBe(true);
  const area = await created.json(), endpoint = `/odata/v4/booking/FloorObjects(${area.ID})`;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let patches = 0, collectionReads = 0;
  try {
    await page.goto('/floor-editor/' + floor);
    await page.getByRole('button', { name: area.name, exact: true }).click();
    expect((await geometry(page, area.ID)).x).toBe(100);
    await page.route(url => url.pathname === endpoint, async route => {
      if (route.request().method() === 'PATCH' && ++patches === 1) await held;
      await route.continue();
    });
    page.on('request', req => { if (req.method() === 'GET' && req.url().includes('/odata/v4/booking/')) collectionReads++; });
    await page.locator('.planViewport').evaluate(element => { element.dataset.autosaveMarker = 'original'; });
    const shape = page.locator(`[data-object="${area.ID}"] .objectShape`);
    const box = await shape.boundingBox();
    await page.mouse.move(box.x + 25, box.y + 25);await page.mouse.down();
    await page.mouse.move(box.x + 65, box.y + 50, { steps: 5 });await page.mouse.up();
    await expect.poll(() => patches).toBe(1);
    expect((await geometry(page, area.ID)).x).toBeGreaterThan(100);
    const movedX = (await geometry(page, area.ID)).x;
    const viewport = page.locator('.planViewport');
    await viewport.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    expect((await geometry(page, area.ID)).x).toBeCloseTo(movedX + 2, 2);
    const handle = await page.locator(`[data-object="${area.ID}"] [data-handle="se"]`).boundingBox();
    await page.mouse.move(handle.x + 5, handle.y + 5);await page.mouse.down();
    await page.mouse.move(handle.x + 45, handle.y + 35, { steps: 5 });await page.mouse.up();
    expect((await geometry(page, area.ID)).width).toBeGreaterThan(160);
    // Keep the response pending beyond UI5's usual busy-indicator delay.
    await page.waitForTimeout(1200);
    await expect(page.locator('.sapUiLocalBusyIndicator:visible')).toHaveCount(0);
    await expect(viewport).toHaveAttribute('data-autosave-marker', 'original');
    expect(collectionReads).toBe(0);expect(patches).toBe(1);
    const drawn = await geometry(page, area.ID), expected = { x: Math.round(drawn.x * 100) / 100, width: drawn.width };
    release();
    await expect.poll(async () => {
      const saved = await (await request.get(endpoint)).json();return { x: Number(saved.x), width: Number(saved.width) };
    }).toEqual(expected);
    expect(patches).toBe(2);expect(collectionReads).toBe(0);
    await page.reload();
    await page.getByRole('button', { name: area.name, exact: true }).click();
    expect((await geometry(page, area.ID)).x).toBeCloseTo(expected.x, 2);
  } finally { release();await page.unrouteAll({ behavior: 'wait' });await request.delete(endpoint); }
});

test('floor row opens its editor and the direct URL preserves the selected floor', async ({ page }) => {
  const floor = '40000000-0000-4000-8000-000000000002';
  await page.addInitScript(user => { localStorage.setItem('rsvroom.user', user);localStorage.setItem('rsvroom.language', 'en'); }, user);
  await page.goto('/#admin');
  await page.locator('.adminToolbar .sapMSlt').click();
  await page.getByRole('option', { name: 'Floors', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Berlin Building A' });
  await row.getByRole('button', { name: 'Open floor editor', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#/?floor-editor/' + floor));
  await page.goto('/floor-editor/' + floor);
  await expect(page.getByRole('heading', { name: 'Plan editor', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Floor', exact: true })).toContainText('Berlin Building A');
});
