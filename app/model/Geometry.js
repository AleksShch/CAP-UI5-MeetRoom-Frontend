(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(function () {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = value => Math.round(value * 100) / 100;
  const snap = (value, grid) => (grid ? Math.round(value / grid) * grid : value);
  function point(screen, view) {
    return { x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom };
  }
  function move(rect, dx, dy, bounds, grid = 0) {
    return {
      ...rect,
      x: round(clamp(snap(Number(rect.x) + dx, grid), 0, bounds.width - rect.width)),
      y: round(clamp(snap(Number(rect.y) + dy, grid), 0, bounds.height - rect.height))
    };
  }
  function rectangle(a, b, bounds, grid = 0) {
    const x1 = clamp(snap(a.x, grid), 0, bounds.width),
      y1 = clamp(snap(a.y, grid), 0, bounds.height),
      x2 = clamp(snap(b.x, grid), 0, bounds.width),
      y2 = clamp(snap(b.y, grid), 0, bounds.height);
    return {
      x: round(Math.min(x1, x2)),
      y: round(Math.min(y1, y2)),
      width: round(Math.abs(x2 - x1)),
      height: round(Math.abs(y2 - y1))
    };
  }
  function resize(rect, handle, dx, dy, bounds, grid = 0) {
    let left = Number(rect.x),
      top = Number(rect.y),
      right = left + Number(rect.width),
      bottom = top + Number(rect.height);
    if (handle.includes('w')) left = clamp(snap(left + dx, grid), 0, right - 1);
    if (handle.includes('e')) right = clamp(snap(right + dx, grid), left + 1, bounds.width);
    if (handle.includes('n')) top = clamp(snap(top + dy, grid), 0, bottom - 1);
    if (handle.includes('s')) bottom = clamp(snap(bottom + dy, grid), top + 1, bounds.height);
    const width = round(right - left),
      height = round(bottom - top);
    return {
      ...rect,
      x: round(left),
      y: round(top),
      width,
      height,
      radius: Math.min(Number(rect.radius) || 0, width / 2, height / 2)
    };
  }
  function zoomAt(view, zoom, screen) {
    const world = point(screen, view);
    return { zoom, panX: screen.x - world.x * zoom, panY: screen.y - world.y * zoom };
  }
  function fit(bounds, viewport) {
    const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height, 5) * 0.94;
    return {
      zoom,
      panX: (viewport.width - bounds.width * zoom) / 2,
      panY: (viewport.height - bounds.height * zoom) / 2
    };
  }
  return { clamp, point, move, rectangle, resize, zoomAt, fit };
});
