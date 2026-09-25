const { expect } = require('@playwright/test');

async function geometry(page, id) {
  return page.locator(`[data-object="${id}"]`).evaluate(node => {
    const matrix = node.transform.baseVal.consolidate().matrix, shape = node.querySelector('.objectShape');
    return { x: matrix.e, y: matrix.f, width: Number(shape.getAttribute('width')), height: Number(shape.getAttribute('height')), radius: Number(shape.getAttribute('rx')) };
  });
}

async function expectPanViewer(page, id) {
  await expect(page.locator('.planTools [data-action="select"], .planTools [data-action="pan"], .planTools [data-action="draw"]')).toHaveCount(0);
  await expect(page.locator('.planTools [data-action="in"]')).toBeEnabled();
  const object = page.locator(`[data-object="${id}"]`), world = page.locator('.planWorld');
  const selected = await object.getAttribute('aria-pressed'), before = await geometry(page, id);
  const transform = await world.evaluate(node => node.style.transform);
  const box = await object.locator('.objectShape').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 });await page.mouse.up();
  expect(await world.evaluate(node => node.style.transform)).not.toBe(transform);
  expect(await geometry(page, id)).toEqual(before);
  await expect(object).toHaveAttribute('aria-pressed', selected);
}

module.exports = { geometry, expectPanViewer };
