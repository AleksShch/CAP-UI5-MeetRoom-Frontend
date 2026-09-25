(function (factory) {
  if (typeof sap !== 'undefined') sap.ui.define([], factory);
  else module.exports = factory();
})(function () {
  'use strict';
  const parts = (value, zone) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(new Date(value))
        .filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value])
    );
  const date = (value = new Date(), zone = 'UTC') => {
    const p = parts(value, zone);
    return `${p.year}-${p.month}-${p.day}`;
  };
  const clock = (value, zone) => {
    const p = parts(value, zone);
    return `${p.hour}:${p.minute}`;
  };
  function toUTC(day, time, zone) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw new Error('invalidTime');
    const wall = Date.parse(`${day}T${time}:00Z`);
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== day)
      throw new Error('invalidTime');
    const offsets = new Set();
    for (const hours of [-36, -12, 0, 12, 36]) {
      const sample = wall + hours * 3600000,
        p = parts(sample, zone);
      offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - sample);
    }
    const candidates = [...offsets]
      .map(offset => wall - offset)
      .filter(value => date(value, zone) === day && clock(value, zone) === time);
    if (candidates.length !== 1)
      throw new Error(candidates.length ? 'ambiguousTime' : 'nonexistentTime');
    return new Date(candidates[0]).toISOString();
  }
  const addDays = (day, count) =>
    new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
  return {
    date,
    clock,
    toUTC,
    addDays,
    monday: day => {
      const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
      return addDays(day, -(weekday || 7) + 1);
    },
    interval: (day, start, end, zone) => {
      const startAt = toUTC(day, start, zone),
        endAt = toUTC(day, end, zone);
      if (startAt >= endAt) throw new Error('invalidInterval');
      return { startAt, endAt };
    },
    overlaps: (booking, interval) =>
      booking.status === 'CONFIRMED' &&
      Date.parse(booking.startAt) < Date.parse(interval.endAt) &&
      Date.parse(booking.endAt) > Date.parse(interval.startAt),
    pretty: (day, language, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
      new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(
        new Date(day + 'T12:00:00Z')
      )
  };
});
