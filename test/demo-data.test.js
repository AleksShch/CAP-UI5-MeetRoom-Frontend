const { test } = require('node:test');
const assert = require('node:assert/strict');
const cds = require('@sap/cds');
const { demoData, seed } = require('../scripts/demo-data');
const Time = require('../app/model/Time');

test('autumn demo bookings cover all nine teammates without conflicts and follow local office days across DST', () => {
  const data = demoData();
  assert.equal(data.Users.length, 6);
  assert.equal(data.TeamMembers.length, 6);
  assert.equal(data.WorkDays.length, 405);
  assert.equal(data.Bookings.length, 540);
  const resources = new Map(data.Resources.map(row => [row.ID, row]));
  const floors = new Map(data.Floors.map(row => [row.ID, row]));
  const buildings = new Map(data.Buildings.map(row => [row.ID, row]));
  for (const day of data.WorkDays) {
    assert.ok(day.date >= '2026-09-20' && day.date <= '2026-11-20');
    assert.ok([1, 2, 3, 4, 5].includes(new Date(day.date).getUTCDay()));
    const bookings = data.Bookings.filter(row => row.user_ID === day.user_ID && row.startAt.startsWith(day.date));
    assert.equal(bookings.filter(row => resources.get(row.resource_ID).type === 'WORKPLACE').length, day.mode === 'OFFICE' ? 1 : 0);
    if (day.mode === 'HOME') assert.equal(bookings.length, 0);
    for (const booking of bookings) {
      const resource = resources.get(booking.resource_ID), floor = floors.get(resource.floor_ID);
      // Original office buildings share the city's numeric suffix with its site.
      const site = buildings.get(floor.building_ID)?.site_ID || floor.building_ID.replace('30000000', '20000000');
      assert.equal(site, day.site_ID);
      const zone = site.endsWith('3') ? 'Europe/Warsaw' : 'Europe/Berlin';
      assert.equal(Time.clock(booking.startAt, zone), resource.type === 'ROOM' ? '10:00' : '09:00');
      assert.equal(Time.clock(booking.endAt, zone), resource.type === 'ROOM' ? '11:00' : '17:00');
      assert.ok(booking.attendeeCount <= resource.capacity);
      assert.equal(data.Bookings.filter(other => other.resource_ID === booking.resource_ID && Time.overlaps(other, booking)).length, 1);
    }
  }
  const people = [...new Set(data.WorkDays.map(row => row.user_ID))];
  assert.equal(people.length, 9);
  for (const person of people) {
    const bookings = data.Bookings.filter(row => row.user_ID === person);
    assert.ok(bookings.some(row => row.startAt.startsWith('2026-09-21') || row.startAt.startsWith('2026-09-22')));
    assert.ok(bookings.some(row => row.startAt.startsWith('2026-11-19') || row.startAt.startsWith('2026-11-20')));
    assert.ok(bookings.some(row => resources.get(row.resource_ID).type === 'ROOM'));
  }
});

test('demo plans link every desk, room and parking space with valid image coordinates', () => {
  const data = demoData();
  assert.equal(data.Resources.length, 78);
  assert.equal(data.FloorObjects.length, 78);
  const floors = new Map(data.Floors.map(row => [row.ID, row]));
  for (const floor of data.Floors.filter(row => row.planImage)) {
    assert.equal(floor.planImageName, 'office-plan.jpg');
    assert.equal(floor.planWidth, 1466);assert.equal(floor.planHeight, 803);
    assert.match(floor.planImage, /^data:image\/jpeg;base64,/);
    assert.equal(data.Resources.filter(row => row.floor_ID === floor.ID && row.type === 'WORKPLACE').length, 11);
    assert.equal(data.Resources.filter(row => row.floor_ID === floor.ID && row.type === 'ROOM').length, 3);
  }
  for (const object of data.FloorObjects) {
    const floor = floors.get(object.floor_ID), resource = data.Resources.find(row => row.ID === object.resource_ID);
    assert.equal(resource.floor_ID, floor.ID);
    assert.ok(object.x >= 0 && object.y >= 0 && object.x + object.width <= floor.planWidth && object.y + object.height <= floor.planHeight);
    assert.equal(object.type, resource.type === 'WORKPLACE' ? 'DESK' : resource.type);
  }
});

test('fresh CSV deployment and repeated additive import preserve edited demo records', async () => {
  const model = await cds.load('*');
  const db = await cds.connect.to('sqlite::memory:');
  try {
    await cds.deploy(model).to(db);
    const data = demoData(), resource = data.Resources[0];
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.Resources'))).length, 84);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.FloorObjects'))).length, 78);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.Bookings'))).length, 540);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.WorkDays'))).length, 405);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.Users'))).length, 9);
    await db.run(cds.ql.UPDATE('rsvroom.Resources').set({ name: 'User-edited desk' }).where({ ID: resource.ID }));
    const missing = data.FloorObjects[0];
    await db.run(cds.ql.DELETE.from('rsvroom.FloorObjects').where({ ID: missing.ID }));
    assert.equal((await seed(db)).FloorObjects, 1);
    assert.deepEqual(await seed(db), Object.fromEntries(Object.keys(data).map(key => [key, 0])));
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Resources').where({ ID: resource.ID }))).name, 'User-edited desk');
  } finally { await db.disconnect(); }
});

test('additive import respects existing work plans, cancelled bookings and occupied resources', async () => {
  const db = await cds.connect.to('sqlite::memory:');
  try {
    await cds.deploy(await cds.load('*')).to(db);
    const data = demoData(), planned = data.WorkDays[0];
    await db.run(cds.ql.DELETE.from('rsvroom.Bookings'));
    await db.run(cds.ql.DELETE.from('rsvroom.WorkDays'));
    await db.run(cds.ql.INSERT.into('rsvroom.WorkDays').entries({ ...planned, ID: 'aaaaaaaa-0000-4000-8000-000000000001', mode: 'HOME', site_ID: null }));
    const booking = data.Bookings.find(row => row.user_ID === planned.user_ID && !row.startAt.startsWith(planned.date));
    await db.run(cds.ql.INSERT.into('rsvroom.Bookings').entries({ ...booking, ID: 'aaaaaaaa-0000-4000-8000-000000000002', title: 'Existing reservation' }));
    const cancelled = data.Bookings.find(row => row.user_ID !== planned.user_ID);
    await db.run(cds.ql.INSERT.into('rsvroom.Bookings').entries({ ...cancelled, status: 'CANCELLED' }));
    await seed(db);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.WorkDays').where({ user_ID: planned.user_ID, date: planned.date }))).length, 1);
    assert.equal((await db.run(cds.ql.SELECT.from('rsvroom.Bookings'))).filter(row => row.user_ID === planned.user_ID && row.startAt.startsWith(planned.date)).length, 0);
    assert.equal(await db.run(cds.ql.SELECT.one.from('rsvroom.Bookings').where({ ID: booking.ID })), undefined);
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Bookings').where({ ID: cancelled.ID }))).status, 'CANCELLED');
    assert.ok(Object.values(await seed(db)).every(count => count === 0));
  } finally { await db.disconnect(); }
});

test('import merges an existing First Floor and the redundant demo floor without losing bookings', async () => {
  const db = await cds.connect.to('sqlite::memory:');
  try {
    await cds.deploy(await cds.load('*')).to(db);
    const original = '40000000-0000-4000-8000-000000000001';
    const duplicate = 'd4000000-0000-4000-8000-000000000001';
    const resource = demoData().Resources[0];
    await db.run(cds.ql.UPDATE('rsvroom.Floors').set({ code: '1', name: 'First Floor', planImage: null, planImageName: null }).where({ ID: original }));
    await db.run(cds.ql.INSERT.into('rsvroom.Floors').entries({ ID: duplicate, building_ID: '30000000-0000-4000-8000-000000000001', code: 'DEMO', name: 'Demo office floor' }));
    await db.run(cds.ql.UPDATE('rsvroom.Resources').set({ floor_ID: duplicate }).where({ ID: resource.ID }));
    await db.run(cds.ql.UPDATE('rsvroom.FloorObjects').set({ floor_ID: duplicate }).where({ resource_ID: resource.ID }));
    await db.run(cds.ql.INSERT.into('rsvroom.Bookings').entries({ ID: 'd7000000-0000-4000-8000-000000000001', resource_ID: resource.ID, user_ID: '60000000-0000-4000-8000-000000000001', title: 'Preserved booking', startAt: '2035-01-01T09:00:00Z', endAt: '2035-01-01T10:00:00Z' }));
    await seed(db);
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Floors').where({ ID: original }))).name, 'Demo office floor');
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Floors').where({ ID: duplicate }))), undefined);
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Resources').where({ ID: resource.ID }))).floor_ID, original);
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.FloorObjects').where({ resource_ID: resource.ID }))).floor_ID, original);
    assert.equal((await db.run(cds.ql.SELECT.one.from('rsvroom.Bookings').where({ title: 'Preserved booking' }))).resource_ID, resource.ID);
  } finally { await db.disconnect(); }
});
