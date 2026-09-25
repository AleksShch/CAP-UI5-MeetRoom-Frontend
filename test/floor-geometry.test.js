const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/model/Geometry');
const imageSize = require('../srv/plan-image');
const png = require('./fixtures/plan-image.cjs');

test('zoom and pan preserve original image coordinates while drawing and dragging', () => {
  const view = { zoom: 2, panX: -200, panY: -100 };
  assert.deepEqual(G.point({ x: 640, y: 260 }, view), { x: 420, y: 180 });
  const rect = G.rectangle(G.point({ x: 640, y: 260 }, view), G.point({ x: 1260, y: 700 }, view), { width: 1920, height: 1080 });
  assert.deepEqual(rect, { x: 420, y: 180, width: 310, height: 220 });
  const anchor = { x: 800, y: 400 };
  assert.deepEqual(G.point(anchor, G.zoomAt(view, 4, anchor)), G.point(anchor, view));
  assert.deepEqual(G.move(rect, 10, 15, { width: 1920, height: 1080 }), { ...rect, x: 430, y: 195 });
});

test('grid, dragging and all resize handles stay within the original image', () => {
  const bounds = { width: 320, height: 200 }, rect = { x: 20, y: 30, width: 100, height: 80, radius: 12 };
  assert.deepEqual(G.rectangle({ x: 101, y: 84 }, { x: 21, y: 13 }, bounds, 10), { x: 20, y: 10, width: 80, height: 70 });
  assert.deepEqual(G.move(rect, 1000, -1000, bounds, 10), { ...rect, x: 220, y: 0 });
  for (const handle of ['n','ne','e','se','s','sw','w','nw']) {
    for (const delta of [-1000, 1000]) {
      const resized = G.resize(rect, handle, delta, delta, bounds, 10);
      assert.ok(resized.x >= 0 && resized.y >= 0);
      assert.ok(resized.x + resized.width <= bounds.width && resized.y + resized.height <= bounds.height);
      assert.ok(resized.width >= 1 && resized.height >= 1);
      assert.ok(resized.radius <= Math.min(resized.width, resized.height) / 2);
    }
  }
  const view = G.fit({ width: 1920, height: 1080 }, { width: 600, height: 400 });
  assert.ok(view.zoom * 1920 <= 600 && view.zoom * 1080 <= 400);
});

test('image dimensions come from PNG/JPEG bytes and invalid payloads are rejected', () => {
  assert.deepEqual(imageSize('data:image/png;base64,' + png(640, 480).toString('base64')), { width: 640, height: 480 });
  // Minimal JPEG metadata fixture containing a SOF marker.
  const jpeg = Buffer.from('ffd8ffc0000b080438078001011100ffd9', 'hex');
  assert.deepEqual(imageSize('data:image/jpeg;base64,' + jpeg.toString('base64')), { width: 1920, height: 1080 });
  assert.throws(() => imageSize('data:image/png;base64,' + png(50, 100).toString('base64')), /PLAN_IMAGE_DIMENSIONS/);
  for (const input of ['data:image/png;base64,AAAA','https://example.com/plan.jpg','data:image/svg+xml;base64,AAAA']) assert.throws(() => imageSize(input), /PLAN_IMAGE_INVALID/);
});
