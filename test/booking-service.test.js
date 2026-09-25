let authCookie;
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const png = require('./fixtures/plan-image.cjs');

let child, base, room, desk, user, company, site, logs = '';

async function request(method, endpoint, data, expected = 200) {
  const response = await fetch(`${base}/${endpoint}`, {
    method,
    headers: { Cookie: authCookie, ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  assert.equal(response.status, expected, `${method} ${endpoint}: ${text}`);
  return body;
}

const booking = (day, extra = {}) => ({
  resource_ID: room.ID,
  user_ID: user.ID,
  title: 'Project planning',
  startAt: `2035-06-${String(day).padStart(2, '0')}T09:00:00Z`,
  endAt: `2035-06-${String(day).padStart(2, '0')}T10:00:00Z`,
  attendeeCount: 1,
  ...extra
});

before(async () => {
  child = fork(path.join(__dirname, 'fixtures/server.cjs'), [], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CDS_ENV: 'test', NODE_ENV: 'test', CDS_REQUIRES_DB_CREDENTIALS_URL: ':memory:' },
    silent: true
  });
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CAP startup timed out\n${logs}`)), 30000);
    child.once('message', message => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`CAP exited ${code}\n${logs}`)); });
    child.once('error', reject);
  });
  base = `http://127.0.0.1:${port}/odata/v4/booking`;
  const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userID:'60000000-0000-4000-8000-000000000001'})});
  assert.equal(login.status,200,await login.clone().text());
  authCookie=login.headers.get('set-cookie').split(';')[0];
  const resources = (await request('GET', 'Resources')).value;
  room = resources.find(row => row.type === 'ROOM');
  desk = resources.find(row => row.type === 'WORKPLACE');
  user = (await request('GET', 'Users')).value[0];
  company = (await request('GET', `Companies(${user.company_ID})`));
  site = (await request('GET', 'Sites')).value[0];
  assert.ok(room && desk && user && company && site, 'Demo data must include the booking hierarchy.');
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
});

test('parking lots support levels, mapped spaces and conflict-checked bookings', async () => {
  const lot = await request('POST', 'Buildings', { site_ID: site.ID, kind: 'PARKING', code: 'PARK-TEST', name: 'Test parking lot' }, 201);
  const level = await request('POST', 'Floors', { building_ID: lot.ID, code: 'G', name: 'Ground level' }, 201);
  const space = await request('POST', 'Resources', { floor_ID: level.ID, type: 'PARKING', code: 'P01', name: 'Parking P01' }, 201);
  const area = await request('POST', 'FloorObjects', { floor_ID: level.ID, resource_ID: space.ID, type: 'PARKING', name: 'P01' }, 201);
  const reserved = [];
  try {
    const hierarchy = await request('GET', `Resources(${space.ID})?$expand=floor($expand=building($expand=site))`);
    assert.equal(hierarchy.floor.building.kind, 'PARKING');
    assert.equal(hierarchy.floor.building.site.ID, site.ID);
    await request('PATCH', `Buildings(${lot.ID})`, { kind: 'BUILDING' }, 409);
    await request('POST', 'Resources', { floor_ID: level.ID, type: 'ROOM', code: 'BAD', name: 'Invalid room' }, 400);
    await request('POST', 'Resources', { floor_ID: level.ID, type: 'PARKING', code: 'TWO', name: 'Invalid capacity', capacity: 2 }, 400);
    await request('PATCH', `FloorObjects(${area.ID})`, { type: 'DESK' }, 400);
    const data = booking(18, { resource_ID: space.ID, title: 'Parking reservation' });
    reserved.push(await request('POST', 'Bookings', data, 201));
    await request('POST', 'Bookings', data, 409);
    // A desk and a parking space can be booked by the same employee at the same time.
    reserved.push(await request('POST', 'Bookings', { ...data, resource_ID: desk.ID }, 201));
    reserved.push(await request('POST', 'Bookings', { ...data, startAt: data.endAt, endAt: '2035-06-18T11:00:00Z' }, 201));
    await request('PATCH', `Bookings(${reserved[0].ID})`, { status: 'CANCELLED' });
    reserved.push(await request('POST', 'Bookings', data, 201));
    await request('PATCH', `Buildings(${lot.ID})`, { active: false });
    await request('POST', 'Bookings', booking(19, { resource_ID: space.ID }), 409);
    await request('DELETE', `Buildings(${lot.ID})`, undefined, 409);
    await request('DELETE', `Resources(${space.ID})`, undefined, 409);
  } finally {
    for (const row of reserved) await request('DELETE', `Bookings(${row.ID})`, undefined, 204);
    await request('DELETE', `FloorObjects(${area.ID})`, undefined, 204);
    await request('DELETE', `Resources(${space.ID})`, undefined, 204);
    await request('DELETE', `Floors(${level.ID})`, undefined, 204);
    await request('DELETE', `Buildings(${lot.ID})`, undefined, 204);
  }
});

test('OData exposes geographic hierarchy, room/desk views and service metadata', async () => {
  const result = await request('GET', `Resources(${room.ID})?$expand=floor($expand=building($expand=site($expand=company)))`);
  assert.equal(result.floor.building.site.company.ID, company.ID);
  assert.ok(result.floor.building.site.timeZone);
  assert.ok((await request('GET', 'Sites')).value.length >= 3);
  assert.ok((await request('GET', 'Rooms')).value.every(row => row.type === 'ROOM'));
  assert.ok((await request('GET', 'Workplaces')).value.every(row => row.type === 'WORKPLACE'));
  const response = await fetch(`${base}/$metadata`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /EntityType Name="Bookings"/);
});

test('floor images and editable areas persist, validate geometry and keep resource data independent', async () => {
  const original = await request('POST', 'Floors', { building_ID: '30000000-0000-4000-8000-000000000001', code: 'IMAGE-TEST', name: 'Image test floor' }, 201);
  const testRoom = await request('POST', 'Resources', { floor_ID: original.ID, code: 'IMAGE-ROOM', name: 'Image test room', type: 'ROOM', capacity: 8 }, 201);
  const image = 'data:image/png;base64,' + png(640, 480).toString('base64');
  let area;
  try {
    await request('PATCH', `Floors(${original.ID})`, { planImage: image, planWidth: 999, planHeight: 999 }, 200);
    const floor = await request('GET', `Floors(${original.ID})`);
    assert.equal(floor.planWidth, 640);assert.equal(floor.planHeight, 480);assert.equal(floor.planImage, image);
    area = await request('POST', 'FloorObjects', { floor_ID: floor.ID, resource_ID: testRoom.ID, name: 'Room outline', type: 'ROOM', x: 420, y: 180, width: 200, height: 220, radius: 16 }, 201);
    assert.equal(Number(area.width), 200);
    await request('PATCH', `FloorObjects(${area.ID})`, { x: 500 }, 400);
    await request('PATCH', `FloorObjects(${area.ID})`, { radius: 101 }, 400);
    await request('PATCH', `FloorObjects(${area.ID})`, { color: 'red' }, 400);
    await request('PATCH', `FloorObjects(${area.ID})`, { type: 'DESK' }, 400);
    await request('PATCH', `FloorObjects(${area.ID})`, { opacity: 0.6, color: '#336699' }, 200);
    const saved = await request('GET', `FloorObjects(${area.ID})`);
    assert.equal(Number(saved.x), 420);assert.equal(Number(saved.opacity), 0.6);
    await request('POST', 'FloorObjects', { floor_ID: floor.ID, resource_ID: testRoom.ID, name: 'Duplicate link', type: 'ROOM' }, 409);
    const other = (await request('GET', 'Resources')).value.find(row => row.floor_ID !== floor.ID);
    await request('PATCH', `FloorObjects(${area.ID})`, { resource_ID: other.ID }, 400);
    await request('PATCH', `Floors(${floor.ID})`, { planImage: 'data:image/png;base64,' + png(320, 200).toString('base64') }, 409);
    await request('PATCH', `Floors(${floor.ID})`, { planImage: 'data:image/png;base64,AAAA' }, 400);
    await request('PATCH', `Floors(${floor.ID})`, { planImage: null }, 200);
    assert.equal((await request('GET', `FloorObjects(${area.ID})`)).name, 'Room outline');
    await request('DELETE', `FloorObjects(${area.ID})`, undefined, 204);area = null;
    assert.equal((await request('GET', `Resources(${testRoom.ID})`)).ID, testRoom.ID);
  } finally {
    if (area) await request('DELETE', `FloorObjects(${area.ID})`, undefined, 204);
    await request('DELETE', `Resources(${testRoom.ID})`, undefined, 204);
    await request('DELETE', `Floors(${original.ID})`, undefined, 204);
  }
});

test('validation messages follow Accept-Language, including parameters and batch requests', async () => {
  for (const [locale, expected] of [
    ['en', `This resource supports at most ${room.capacity} attendees.`],
    ['de-DE', `Diese Ressource bietet Platz für höchstens ${room.capacity} Teilnehmer.`]
  ]) {
    const response = await fetch(`${base}/Bookings`, {
      method: 'POST', headers: { Cookie: authCookie, 'Content-Type': 'application/json', 'Accept-Language': locale },
      body: JSON.stringify(booking(28, { attendeeCount: room.capacity + 1 }))
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.message, expected);
  }
  const batch = await fetch(`${base}/$batch`, {
    method: 'POST', headers: { Cookie: authCookie, 'Content-Type': 'application/json', 'Accept-Language': 'de' },
    body: JSON.stringify({ requests: [{ id: 'localized', method: 'POST', url: 'Bookings', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'de' }, body: booking(28, { attendeeCount: room.capacity + 1 }) }] })
  });
  assert.equal(batch.status, 200);
  const [result] = (await batch.json()).responses;
  assert.equal(result.status, 400);
  assert.equal(result.body.error.message, `Diese Ressource bietet Platz für höchstens ${room.capacity} Teilnehmer.`);
});

test('new areas use building/floor initials and the next number for concurrent and batch additions', async () => {
  const created = new Set();
  const testFloor = await request('POST', 'Floors', { building_ID: '30000000-0000-4000-8000-000000000001', code: 'NAME-TEST', name: 'First Floor' }, 201);
  const otherFloor = await request('POST', 'Floors', { building_ID: '30000000-0000-4000-8000-000000000002', code: 'NAME-TEST', name: 'First Floor' }, 201);
  const add = async (data = {}) => {
    const row = await request('POST', 'FloorObjects', { floor_ID: testFloor.ID, type: 'ZONE', ...data }, 201);
    created.add(row.ID);return row;
  };
  try {
    const first = await add();assert.equal(first.name, 'HBAFF1');
    assert.equal((await add({ name: 'HBAFF5' })).name, 'HBAFF5');
    const sixth = await add();assert.equal(sixth.name, 'HBAFF6');
    await request('PATCH', `FloorObjects(${sixth.ID})`, { x: 10 }, 200);
    assert.equal((await request('GET', `FloorObjects(${sixth.ID})`)).name, 'HBAFF6');
    await request('DELETE', `FloorObjects(${first.ID})`, undefined, 204);created.delete(first.ID);
    assert.equal((await add()).name, 'HBAFF7');
    const concurrent = await Promise.all([add(), add()]);
    assert.deepEqual(concurrent.map(row => row.name).sort(), ['HBAFF8', 'HBAFF9']);
    const batch = await request('POST', '$batch', { requests: ['a', 'b'].map(id => ({
      id, atomicityGroup: 'areas', method: 'POST', url: 'FloorObjects',
      headers: { 'Content-Type': 'application/json' }, body: { floor_ID: testFloor.ID, type: 'ZONE' }
    })) });
    for (const response of batch.responses) {
      assert.equal(response.status, 201, JSON.stringify(response));created.add(response.body.ID);
    }
    assert.deepEqual(batch.responses.map(response => response.body.name).sort(), ['HBAFF10', 'HBAFF11']);
    assert.equal((await add({ name: 'Custom name' })).name, 'Custom name');

    for (let index = 1; index <= 5; index++) await add({ floor_ID: otherFloor.ID, name: `Legacy area ${index}` });
    assert.equal((await add({ floor_ID: otherFloor.ID })).name, 'BBAFF6');
  } finally {
    for (const id of created) await request('DELETE', `FloorObjects(${id})`, undefined, 204);
    await request('DELETE', `Floors(${testFloor.ID})`, undefined, 204);
    await request('DELETE', `Floors(${otherFloor.ID})`, undefined, 204);
  }
});

test('resources can be created through OData with parent and capacity validation', async () => {
  const newRoom = await request('POST', 'Resources', {
    floor_ID: room.floor_ID, code: 'TEST-ROOM', name: 'Workshop room', type: 'ROOM', capacity: 8
  }, 201);
  await request('POST', 'Resources', {
    floor_ID: room.floor_ID, code: 'BAD-ROOM', name: 'Invalid room', type: 'ROOM', capacity: 0
  }, 400);
  await request('POST', 'Resources', {
    floor_ID: 'ffffffff-ffff-4fff-8fff-ffffffffffff', code: 'MISSING', name: 'Missing floor', type: 'WORKPLACE'
  }, 400);
  await request('DELETE', `Resources(${newRoom.ID})`, undefined, 204);
});

test('primary domains are unique and domains are normalized', async () => {
  await request('POST', 'CompanyDomains', { company_ID: company.ID, domain: 'second-primary.example', primary: true }, 409);
  const domain = await request('POST', 'CompanyDomains', { company_ID: company.ID, domain: '  TEST.EXAMPLE  ', primary: false }, 201);
  assert.equal(domain.domain, 'test.example');
  await request('POST', 'CompanyDomains', { company_ID: company.ID, domain: 'test.example' }, 409);
  await request('POST', 'CompanyDomains', { company_ID: company.ID, domain: 'https://bad.example' }, 400);
  await request('DELETE', `CompanyDomains(${domain.ID})`, undefined, 204);
});

test('site time zones are validated on PATCH', async () => {
  await request('PATCH', `Sites(${site.ID})`, { timeZone: 'Not/A_TimeZone' }, 400);
  await request('PATCH', `Sites(${site.ID})`, { timeZone: null }, 400);
  await request('PATCH', `Sites(${site.ID})`, { locale: 'invalid_locale' }, 400);
  assert.equal((await request('GET', `Sites(${site.ID})`)).timeZone, site.timeZone);
});

test('booking timestamps normalize to UTC and overlapping or enclosing intervals return 409', async () => {
  const created = await request('POST', 'Bookings', booking(1, {
    startAt: '2035-06-01T11:00:00+02:00', endAt: '2035-06-01T12:00:00+02:00'
  }), 201);
  assert.equal(Date.parse(created.startAt), Date.parse('2035-06-01T09:00:00Z'));
  await request('POST', 'Bookings', booking(1), 409);
  await request('POST', 'Bookings', booking(1, { startAt: '2035-06-01T08:00:00Z', endAt: '2035-06-01T11:00:00Z' }), 409);
  await request('POST', 'Bookings', booking(1, { startAt: '2035-06-01T10:00:00Z', endAt: '2035-06-01T11:00:00Z' }), 201);
  await request('POST', 'Bookings', booking(1, { resource_ID: desk.ID }), 201);
});

test('invalid intervals, attendee counts and inactive resources are rejected', async () => {
  await request('POST', 'Bookings', booking(2, { endAt: '2035-06-02T09:00:00Z' }), 400);
  await request('POST', 'Bookings', booking(2, { startAt: '2035-06-02T09:00:00' }), 400);
  await request('POST', 'Bookings', booking(2, { attendeeCount: room.capacity + 1 }), 400);
  await request('POST', 'Bookings', booking(2, { attendeeCount: 0 }), 400);
  await request('POST', 'Bookings', booking(2, { resource_ID: desk.ID, attendeeCount: 2 }), 400);
  await request('PATCH', `Resources(${room.ID})`, { active: false }, 200);
  await request('POST', 'Bookings', booking(2), 409);
  await request('PATCH', `Resources(${room.ID})`, { active: true }, 200);
});

test('PATCH merges stored fields, cancellation releases a slot and reactivation checks collisions', async () => {
  const first = await request('POST', 'Bookings', booking(3), 201);
  await request('PATCH', `Bookings(${first.ID})`, { title: 'Updated planning' }, 200);
  await request('PATCH', `Bookings(${first.ID})`, { endAt: '2035-06-03T08:00:00Z' }, 400);
  await request('PATCH', `Bookings(${first.ID})`, { status: 'CANCELLED' }, 200);
  const replacement = await request('POST', 'Bookings', booking(3), 201);
  await request('PATCH', `Bookings(${first.ID})`, { status: 'CONFIRMED' }, 409);
  await request('DELETE', `Bookings(${replacement.ID})`, undefined, 204);
  await request('PATCH', `Bookings(${first.ID})`, { status: 'CONFIRMED' }, 200);
});

test('concurrent booking requests result in exactly one reservation', async () => {
  const attempts = await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/Bookings`, {
    method: 'POST', headers: { Cookie: authCookie, 'content-type': 'application/json' }, body: JSON.stringify(booking(4))
  })));
  const statuses = attempts.map(response => response.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409]);
  await Promise.all(attempts.map(response => response.text()));
});

test('cross-company bookings and team membership are rejected', async () => {
  const otherCompany = await request('POST', 'Companies', { name: 'Other company' }, 201);
  const otherUser = await request('POST', 'Users', {
    company_ID: otherCompany.ID, displayName: 'Other employee', email: 'employee@other.example'
  }, 201);
  await request('POST', 'Bookings', booking(5, { user_ID: otherUser.ID }), 403);
  const team = (await request('GET', 'Teams')).value[0];
  await request('POST', 'TeamMembers', { team_ID: team.ID, user_ID: otherUser.ID }, 400);
  await request('PATCH', `Users(${otherUser.ID})`, { company_ID: company.ID }, 409);
  await request('DELETE', `Users(${otherUser.ID})`, undefined, 204);
  await request('DELETE', `Companies(${otherCompany.ID})`, undefined, 204);
});

test('referenced hierarchy cannot be deleted and deep writes cannot bypass validation', async () => {
  await request('DELETE', `Resources(${room.ID})`, undefined, 409);
  await request('DELETE', `Companies(${company.ID})`, undefined, 409);
  await request('POST', 'Bookings', { ...booking(6), resource: { ID: room.ID, capacity: 999 } }, 400);
});

test('inactive sites block bookings and cancellation remains possible', async () => {
  const resource = await request('GET', `Resources(${room.ID})?$expand=floor($expand=building)`);
  const siteID = resource.floor.building.site_ID;
  const created = await request('POST', 'Bookings', booking(7), 201);
  await request('PATCH', `Sites(${siteID})`, { active: false }, 200);
  await request('POST', 'Bookings', booking(8), 409);
  await request('PATCH', `Bookings(${created.ID})`, { status: 'CANCELLED' }, 200);
  await request('PATCH', `Sites(${siteID})`, { active: true }, 200);
});

test('moving a booking to another resource rechecks conflicts', async () => {
  const first = await request('POST', 'Bookings', booking(9), 201);
  const second = await request('POST', 'Bookings', booking(9, { resource_ID: desk.ID }), 201);
  await request('PATCH', `Bookings(${second.ID})`, { resource_ID: room.ID }, 409);
  await request('PATCH', `Bookings(${first.ID})`, { startAt: '2035-06-10T09:00:00Z', endAt: '2035-06-10T10:00:00Z' }, 200);
  await request('PATCH', `Bookings(${second.ID})`, { resource_ID: room.ID }, 200);
});

test('a room cannot shrink below an upcoming reservation and invalid enum values are rejected', async () => {
  await request('POST', 'Bookings', booking(11, { attendeeCount: room.capacity }), 201);
  await request('PATCH', `Resources(${room.ID})`, { capacity: room.capacity - 1 }, 409);
  await request('POST', 'Resources', {
    floor_ID: room.floor_ID, code: 'INVALID-TYPE', name: 'Invalid resource', type: 'NOT_A_RESOURCE'
  }, 400);
  await request('POST', 'Bookings', booking(12, { status: 'UNKNOWN' }), 400);
  await request('POST', 'Bookings', booking(12, { resource_ID: null }), 400);
});

test('opening and employee schedules validate days, time ordering and company links', async () => {
  await request('POST', 'OpeningHours', { site_ID: site.ID, dayOfWeek: 8, opensAt: '08:00:00', closesAt: '17:00:00' }, 400);
  await request('POST', 'OpeningHours', { site_ID: site.ID, dayOfWeek: 1, opensAt: '17:00:00', closesAt: '08:00:00' }, 400);
  const schedule = await request('POST', 'WorkSchedules', {
    user_ID: user.ID, site_ID: site.ID, dayOfWeek: 6, startTime: '09:00:00', endTime: '12:00:00'
  }, 201);
  await request('PATCH', `WorkSchedules(${schedule.ID})`, { endTime: '08:00:00' }, 400);
  await request('DELETE', `WorkSchedules(${schedule.ID})`, undefined, 204);
});

test('dated work plans persist, require an office when appropriate and enforce one plan per employee/day', async () => {
  await request('POST', 'WorkDays', { user_ID:user.ID,date:'2035-07-01',mode:'OFFICE',startTime:'08:00:00',endTime:'17:00:00' },400);
  const day=await request('POST','WorkDays',{user_ID:user.ID,date:'2035-07-01',mode:'HOME',startTime:'08:00:00',endTime:'17:00:00'},201);
  await request('POST','WorkDays',{user_ID:user.ID,date:'2035-07-01',mode:'VACATION',startTime:'08:00:00',endTime:'17:00:00'},409);
  await request('PATCH',`WorkDays(${day.ID})`,{mode:'OFFICE',site_ID:site.ID},200);
  assert.equal((await request('GET',`WorkDays(${day.ID})`)).site_ID,site.ID);
  await request('PATCH',`WorkDays(${day.ID})`,{endTime:'07:00:00'},400);
  await request('DELETE',`WorkDays(${day.ID})`,undefined,204);
});

test('display heartbeat requires a valid token, hides hashes, and token rotation revokes old links',async()=>{
  const display=(await request('GET','Displays')).value[0];
  assert.equal(Object.hasOwn(display,'tokenHash'),false);
  const token=(await request('POST','provisionDevice',{deviceID:display.ID},200)).value;
  assert.match(token,/^[a-f0-9]{64}$/);
  await request('POST','deviceHeartbeat',{deviceID:display.ID,token:'wrong'},403);
  assert.equal((await request('GET',`Displays(${display.ID})`)).lastSeen,null);
  await request('POST','deviceHeartbeat',{deviceID:display.ID,token},200);
  assert.ok((await request('GET',`Displays(${display.ID})`)).lastSeen);
  await request('POST','provisionDevice',{deviceID:display.ID},200);
  await request('POST','deviceHeartbeat',{deviceID:display.ID,token},403);
});

test('floor plans persist as SVG and resource coordinates cannot exceed their dimensions',async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><rect width="1000" height="600" fill="white"/></svg>';
  await request('PATCH',`Floors(${room.floor_ID})`,{floorPlan:svg},200);
  assert.equal((await request('GET',`Floors(${room.floor_ID})`)).floorPlan,svg);
  await request('PATCH',`Floors(${room.floor_ID})`,{floorPlan:'<svg><script>alert(1)</script></svg>'},400);
  await request('PATCH',`Resources(${desk.ID})`,{mapX:420,mapY:180},200);
  const floor = await request('GET', `Floors(${desk.floor_ID})`);
  await request('PATCH',`Resources(${desk.ID})`,{mapX:floor.planWidth+1},400);
  assert.equal(Number((await request('GET',`Resources(${desk.ID})`)).mapX),420);
});

test('team restrictions are checked on the server, not only on the map',async()=>{
  const team=await request('POST','Teams',{company_ID:company.ID,name:'Restricted test team'},201);
  const resource=await request('POST','Resources',{floor_ID:room.floor_ID,type:'WORKPLACE',code:'RESTRICTED',name:'Team desk',restrictedTeam_ID:team.ID},201);
  await request('POST','Bookings',booking(20,{resource_ID:resource.ID}),403);
  const membership=await request('POST','TeamMembers',{team_ID:team.ID,user_ID:user.ID},201);
  const reserved=await request('POST','Bookings',booking(20,{resource_ID:resource.ID}),201);
  await request('DELETE',`TeamMembers(${membership.ID})`,undefined,204);
  await request('PATCH',`Bookings(${reserved.ID})`,{status:'CANCELLED'},200);
  await request('DELETE',`Bookings(${reserved.ID})`,undefined,204);
  await request('DELETE',`Resources(${resource.ID})`,undefined,204);
  await request('DELETE',`Teams(${team.ID})`,undefined,204);
});
