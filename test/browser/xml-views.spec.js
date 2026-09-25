const { test, expect } = require('@playwright/test');
const { loginBrowser } = require('./auth.cjs');

test('XML views update bindings and retain their instance across navigation and language changes', async ({
  page,
  request
}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => {
    // The source-served app falls back when optional runtime/preload artifacts are absent.
    if (
      message.type() === 'error' &&
      !/sap-ui-version|Component-preload|Failed to load resource/.test(message.text())
    )
      errors.push(message.text());
  });
  await loginBrowser(page, request);
  await page.goto('/#spaces');
  await expect(page.getByRole('heading', { name: 'Find a space', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const Element = sap.ui.require('sap/ui/core/Element');
    const app = Element.getElementById(document.querySelector('.workspace').id)
      .getParent()
      .getController();
    window.xmlApp = app;
    window.xmlReservations = await app.pages.get('Reservations');
    window.xmlPicker = window.xmlReservations.byId('resource');
  });
  const picker = page.getByRole('combobox', { name: 'Resource', exact: true });
  await picker.press('Space');
  await page.getByRole('option', { name: 'Hannover Desk 1 · Available', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hannover Desk 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(picker).toContainText('Hannover Desk 1');
  await page.getByRole('button', { name: 'Overview', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Make room for a good day.' })).toBeVisible();
  await page.getByRole('button', { name: 'Find a space', exact: true }).first().click();
  await expect(picker).toContainText('Hannover Desk 1');
  expect(
    await page.evaluate(
      async () =>
        window.xmlReservations === (await window.xmlApp.pages.get('Reservations')) &&
        window.xmlPicker === window.xmlReservations.byId('resource')
    )
  ).toBe(true);
  await page.getByRole('combobox', { name: 'Language', exact: true }).press('Space');
  await page.getByRole('option', { name: 'German', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Arbeitsplatz finden', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reservieren', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Titel', { exact: true })).toHaveValue('Arbeiten im Büro');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('switching profiles releases cached XML views and their models', async ({ page, request }) => {
  await loginBrowser(page, request);
  await page.goto('/#admin');
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const Element = sap.ui.require('sap/ui/core/Element');
    const app = Element.getElementById(document.querySelector('.workspace').id)
      .getParent()
      .getController();
    const oldView = await app.pages.get('Admin'),
      oldModel = oldView.getModel('page');
    const profiles = await app.model.api.auth('profiles');
    await app.controllers.Account.signInProfile(profiles.find(p => p.role === 'USER').ID);
    await app.refresh();
    return {
      destroyed: oldView.isDestroyed(),
      detached: !app.pages.has('Admin'),
      dataReleased: Object.keys(oldModel.getData()).length === 0
    };
  });
  expect(result).toEqual({ destroyed: true, detached: true, dataReleased: true });
  await expect(page.getByRole('heading', { name: 'Make room for a good day.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0);
});

test('XML area setup links a new resource and account fragments load independently', async ({
  page,
  request
}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await loginBrowser(page, request);
  const floor = '40000000-0000-4000-8000-000000000001';
  const response = await request.post('/odata/v4/booking/FloorObjects', {
    data: {
      floor_ID: floor,
      name: 'XML area ' + Date.now(),
      type: 'ZONE',
      x: 100,
      y: 100,
      width: 160,
      height: 100
    }
  });
  expect(response.ok(), await response.text()).toBe(true);
  const area = await response.json();
  let resourceID;
  try {
    await page.goto('/floor-editor/' + floor);
    await page.getByRole('button', { name: area.name, exact: true }).click();
    await page.getByRole('button', { name: 'Set up booking', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(area.name);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const linked = await (await request.get(`/odata/v4/booking/FloorObjects(${area.ID})`)).json();
    resourceID = linked.resource_ID;
    expect(resourceID).toBeTruthy();
    const resource = await (await request.get(`/odata/v4/booking/Resources(${resourceID})`)).json();
    expect(resource.name).toBe(area.name);
    expect(resource.type).toBe('WORKPLACE');
    await page.evaluate(async () => {
      const Element = sap.ui.require('sap/ui/core/Element');
      window.xmlApp = Element.getElementById(document.querySelector('.workspace').id)
        .getParent()
        .getController();
      await window.xmlApp.dialogs.account();
    });
    dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Anna');
    await dialog.getByRole('button', { name: 'Set password', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByLabel('New password', { exact: true })
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() =>
      window.xmlApp.dialogs.displayLink(location.origin + '/display/desk/test')
    );
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Open', exact: true })
    ).toHaveAttribute('href', /\/display\/desk\/test$/);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'My team', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'My team', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    // Recover the resource ID even if a later UI assertion fails.
    const linked = await (await request.get(`/odata/v4/booking/FloorObjects(${area.ID})`)).json();
    resourceID ||= linked.resource_ID;
    await request.delete(`/odata/v4/booking/FloorObjects(${area.ID})`);
    if (resourceID) await request.delete(`/odata/v4/booking/Resources(${resourceID})`);
  }
});
