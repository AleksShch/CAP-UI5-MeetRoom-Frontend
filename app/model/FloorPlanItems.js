sap.ui.define([], function () {
  'use strict';
  const hasCoordinate = value =>
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value));
  const position = object => ({
    ...object,
    ...(!hasCoordinate(object.x) || !hasCoordinate(object.y)
      ? { x: 0, y: 0, missingCoordinates: true }
      : { missingCoordinates: false })
  });
  return function floorPlanItems(resources, objects, objectTypes, editing) {
    if (editing) return objects.map(position);
    return objects.flatMap(object => {
      const resource = resources.find(row => row.ID === object.resource_ID);
      if (!resource || !objectTypes.includes(object.type)) return [];
      return [
        {
          ...position(object),
          resource,
          statusText: resource.statusText,
          availability: resource.availability
        }
      ];
    });
  };
});
