const { test, expect } = require('@playwright/test');
const { loginBrowser } = require('./auth.cjs');

test('resource picker books, edits and cancels through the MVC controllers', async ({
  page,
  request
}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await loginBrowser(page, request);
  const title = 'MVC reservation ' + Date.now();
  const editedTitle = title + ' edited';
  try {
    await page.goto('/#spaces');
    await page.getByRole('combobox', { name: 'Resource', exact: true }).press('Space');
    await page.getByRole('option', { name: 'Hannover Desk 1 · Available', exact: true }).click();
    await page.getByRole('button', { name: 'Reserve', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill(title);
    await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'My bookings', exact: true }).first().click();
    let card = page.locator('.bookingCard').filter({ hasText: title });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill(editedTitle);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    card = page.locator('.bookingCard').filter({ hasText: editedTitle });
    await card.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(card).toContainText('Cancelled');
    expect(errors).toEqual([]);
  } finally {
    const rows = (await (await request.get('/odata/v4/booking/Bookings')).json()).value;
    for (const row of rows.filter(row => row.title === title || row.title === editedTitle)) {
      await request.delete(`/odata/v4/booking/Bookings(${row.ID})`);
    }
  }
});
