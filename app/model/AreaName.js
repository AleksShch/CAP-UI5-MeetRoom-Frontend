(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(function () {
  'use strict';
  return function nextAreaName(buildingName, floorName, areas) {
    // Use the same building + floor label shown in the editor, independent of UI language.
    const words = `${buildingName || ''} ${floorName || ''}`.match(/[\p{L}\p{N}]+/gu) || [];
    const prefix = (
      words
        .map(word => [...word][0])
        .join('')
        .toUpperCase() || 'AREA'
    ).slice(0, 160);
    // Count legacy/manual names as well, and never fill gaps below an existing number.
    let highest = BigInt(areas.length);
    for (const area of areas) {
      const name = String(area.name || '')
        .trim()
        .toUpperCase();
      if (!name.startsWith(prefix)) continue;
      const suffix = name.slice(prefix.length);
      if (/^\d+$/.test(suffix) && BigInt(suffix) > highest) highest = BigInt(suffix);
    }
    return prefix + (highest + 1n);
  };
});
