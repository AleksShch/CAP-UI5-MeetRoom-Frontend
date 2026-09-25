const { test, expect } = require('@playwright/test');
const { loginBrowser } = require('./auth.cjs');

test('demo desks, rooms and parking render their plans and can be booked', async ({ page, request }) => {
  await loginBrowser(page, request);
  const base = '/odata/v4/booking/', created = [];
  try {
    for (const [route, number, count] of [['desk',101,11],['room',121,3],['parking-space',141,12]]) {
      const resource = `d5000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
      await page.goto(`/${route}/${resource}`);
      await expect(page.locator('.planObject')).toHaveCount(count);
      await page.getByLabel('Date', { exact: true }).fill('Jun 18, 2035');
      await page.getByLabel('Date', { exact: true }).press('Tab');
      if (route !== 'parking-space') await expect(page.locator('.planWorld > image')).toHaveAttribute('href', /^data:image\/jpeg;base64,/);
      const shape = page.locator(`[data-object="d6000000-0000-4000-8000-${String(number).padStart(12,'0')}"]`);
      await shape.click();
      await page.getByRole('button', { name: 'Reserve', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const bookings = (await (await request.get(base + 'Bookings')).json()).value.filter(row => row.resource_ID === resource && row.startAt.startsWith('2035-06-18'));
      expect(bookings).toHaveLength(1);created.push(bookings[0].ID);
    }
  } finally { for (const id of created) await request.delete(base + `Bookings(${id})`); }
});

for (const [email, name, count] of [['anna@example.com', 'Anna Example', 81], ['lena@example.de', 'Lena Fischer', 36]]) {
  test(`demo bookings and dated teammate presence are visible for ${name}`, async ({ page, request }) => {
    await loginBrowser(page, request, email);
    await page.goto('/#bookings');
    await expect(page.locator('.bookingCard')).toHaveCount(count);
    await expect(page.locator('.bookingCard').filter({ hasText: name })).toHaveCount(count);
    await expect(page.locator('.bookingCard').filter({ hasText: 'Team meeting' })).toHaveCount(9);
    await page.goto('/#team');
    await expect(page.locator('.personCard')).toHaveCount(9);
    const date = page.getByLabel('Date', { exact: true });
    const lena = page.locator('.personCard').filter({ hasText: 'Lena Fischer' });
    const jonas = page.locator('.personCard').filter({ hasText: 'Jonas Weber' });
    await date.fill('Sep 21, 2026');await date.press('Tab');
    await expect(lena.getByRole('link', { name: 'DEMO-D2', exact: true })).toBeVisible();
    await expect(jonas).toContainText('Home office');
    await expect(page.locator('.personCard a:visible')).toHaveCount(6);
    await date.fill('Nov 20, 2026');await date.press('Tab');
    await expect(lena).toContainText('Home office');
    await expect(jonas.getByRole('link', { name: 'DEMO-D3', exact: true })).toBeVisible();
    await expect(page.locator('.personCard a:visible')).toHaveCount(6);
  });
}
