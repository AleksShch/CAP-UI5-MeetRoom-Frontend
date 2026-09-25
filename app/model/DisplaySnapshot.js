(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(function () {
  'use strict';
  return function displaySnapshot(value) {
    const snapshot = typeof value === 'string' ? JSON.parse(value) : value;
    if (!snapshot?.resource) return snapshot;
    const resource = snapshot.resource,
      floor = resource.floor,
      building = floor?.building,
      site = building?.site;
    const rows = value => (value ? [value] : []);
    return {
      Resources: rows(resource),
      Floors: rows(floor),
      Buildings: rows(building),
      Sites: rows(site),
      Companies: rows(site?.company),
      Bookings: snapshot.bookings || [],
      Users: []
    };
  };
});
