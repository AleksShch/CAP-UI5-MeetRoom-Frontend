const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { password } = require('./fixtures/auth.cjs');
const adminID = '60000000-0000-4000-8000-000000000001';
const keyID = '60000000-0000-4000-8000-000000000002';
const userID = '60000000-0000-4000-8000-000000000003';
const companyID = '10000000-0000-4000-8000-000000000001';
const setupFile = path.resolve(__dirname, '../.tmp-auth-setup-' + randomUUID());
let child, origin, admin, keyUser, user, room, setupToken, logs = '';

async function http(url, method = 'GET', body, cookie, expected = 200, headers = {}) {
  const response = await fetch(origin + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  assert.equal(response.status, expected, method + ' ' + url + ': ' + text);
  return { response, data: text ? JSON.parse(text) : null };
}
const api = async (actor, method, target, body, expected = 200, headers) => (await http('/odata/v4/booking/' + target, method, body, actor, expected, headers)).data;
const login = async email => (await http('/auth/login', 'POST', { email, password })).response.headers.get('set-cookie').split(';')[0];
const booking = (day, owner = userID) => ({ resource_ID: room.ID, user_ID: owner, title: 'Role check', startAt: `2040-01-${String(day).padStart(2, '0')}T09:00:00Z`, endAt: `2040-01-${String(day).padStart(2, '0')}T10:00:00Z` });

before(async () => {
  child = fork(path.join(__dirname, 'fixtures/server.cjs'), [], { cwd: path.join(__dirname, '..'), env: { ...process.env, RSVROOM_AUTH_MODE:'password', NODE_ENV: 'test', CDS_ENV: 'test', CDS_REQUIRES_DB_CREDENTIALS_URL: ':memory:', RSVROOM_TEST_SETUP: 'true', RSVROOM_SETUP_TOKEN_FILE: setupFile }, silent: true });
  child.stdout.on('data', chunk => { logs += chunk; });child.stderr.on('data', chunk => { logs += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs)), 30000);
    child.once('message', value => { clearTimeout(timeout);resolve(value.port); });
    child.once('exit', () => { clearTimeout(timeout);reject(new Error(logs)); });
    child.once('error', reject);
  });
  origin = `http://127.0.0.1:${port}`;
  setupToken = fs.readFileSync(setupFile, 'utf8');
});

after(async () => {
  if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve));child.kill();await exited; }
  fs.rmSync(setupFile, { force: true });
});

test('first administrator setup requires a token and cannot be repeated', async () => {
  assert.equal((await http('/auth/status')).data.setupRequired, true);
  await http('/auth/setup', 'POST', { email: 'anna@example.com', password, token: 'wrong' }, null, 403);
  const setup = await http('/auth/setup', 'POST', { email: 'anna@example.com', password, token: setupToken });
  assert.equal(setup.data.role, 'ADMIN');assert(!('passwordHash' in setup.data));
  const cookie = setup.response.headers.get('set-cookie');assert.match(cookie, /HttpOnly/);assert.match(cookie, /SameSite=Strict/);
  admin = cookie.split(';')[0];
  assert.equal((await http('/auth/status')).data.setupRequired, false);
  await http('/auth/setup', 'POST', { email: 'ola@example.com', password, token: setupToken }, null, 409);
  assert.equal(fs.existsSync(setupFile), false);
  await api(admin, 'PATCH', `Users(${keyID})`, { role: 'KEY_USER' });
  await api(admin, 'POST', 'setUserPassword', { userID: keyID, password });
  await api(admin, 'POST', 'setUserPassword', { userID, password });
  keyUser = await login('max@example.de');user = await login('ola@example.com');
  room = (await api(admin, 'GET', 'Resources')).value.find(row => row.type === 'ROOM');
});

test('sessions authenticate users; forged client identities and private fields are rejected', async () => {
  await api(null, 'GET', 'Users', undefined, 401, { 'x-user-id': adminID, 'x-role': 'ADMIN', Authorization: 'Basic ' + Buffer.from(adminID + ':anything').toString('base64') });
  await http('/auth/login', 'POST', { email: 'ola@example.com', password: 'wrong' }, null, 401);
  assert.equal((await api(user, 'GET', 'currentUser()')).ID, userID);
  assert.equal((await api(user, 'GET', 'currentUser()')).role, 'USER');
  const users = await api(user, 'GET', 'Users');assert(!JSON.stringify(users).includes('passwordHash'));
  await api(admin, 'GET', 'Users?$select=passwordHash', undefined, 400);
  await api(admin, 'GET', 'Companies?$expand=users($select=passwordHash)', undefined, 400);
  await api(admin, 'GET', 'AuthSessions', undefined, 404);
  await api(user, 'POST', 'Bookings', booking(1), 403, { Origin: 'https://untrusted.example' });
});

test('every role can book only for itself; owners can edit and cancel their bookings', async () => {
  for (const [actor, id, day] of [[user, userID, 1], [keyUser, keyID, 2], [admin, adminID, 3]]) {
    const own = await api(actor, 'POST', 'Bookings', booking(day, id), 201);
    await api(actor, 'PATCH', `Bookings(${own.ID})`, { title: 'Changed by owner' });
    await api(actor, 'PATCH', `Bookings(${own.ID})`, { user_ID: id === userID ? keyID : userID }, 403);
    await api(actor, 'PUT', `Bookings(${own.ID})/user_ID`, { value: id === userID ? keyID : userID }, 403);
    await api(actor, 'POST', 'Bookings', booking(day + 10, id === userID ? keyID : userID), 403);
    await api(actor, 'PATCH', `Bookings(${own.ID})`, { status: 'CANCELLED' });
    await api(actor, 'DELETE', `Bookings(${own.ID})`, undefined, 204);
  }
  const own = await api(user, 'POST', 'Bookings', { ...booking(4), user_ID: undefined }, 201);
  assert.equal(own.user_ID, userID);
  await api(keyUser, 'PATCH', `Bookings(${own.ID})`, { title: 'Foreign edit' }, 403);
  await api(admin, 'PATCH', `Bookings(${own.ID})`, { status: 'CANCELLED' }, 403);
  await api(keyUser, 'DELETE', `Bookings(${own.ID})`, undefined, 204);
  const other = await api(keyUser, 'POST', 'Bookings', booking(5, keyID), 201);
  await api(user, 'DELETE', `Bookings(${other.ID})`, undefined, 403);
  await api(admin, 'DELETE', `Bookings(${other.ID})`, undefined, 204);
});

test('users cannot alter master data, roles, devices, users or other work plans', async () => {
  await api(user, 'POST', 'Users', { company_ID: companyID, email: 'blocked@example.com', displayName: 'Blocked' }, 403);
  for (const actor of [user, keyUser]) {
    await api(actor, 'PATCH', `Users(${userID})`, { role: 'ADMIN' }, 403);
    await api(actor, 'PUT', `Users(${userID})/role`, { value: 'ADMIN' }, 403);
    await api(actor, 'PATCH', `Resources(${room.ID})`, { name: 'Forbidden' }, 403);
    await api(actor, 'POST', 'FloorObjects', { floor_ID: room.floor_ID, type: 'ZONE' }, 403);
    const floor = await api(actor, 'GET', `Floors(${room.floor_ID})`);
    const building = await api(actor, 'GET', `Buildings(${floor.building_ID})`);
    await api(actor, 'POST', 'Buildings', { site_ID: building.site_ID, kind: 'PARKING', code: 'DENIED', name: 'Forbidden parking lot' }, 403);
    await api(actor, 'POST', 'Resources', { floor_ID: room.floor_ID, type: 'PARKING', code: 'DENIED', name: 'Forbidden parking space' }, 403);
    await api(actor, 'POST', 'provisionDevice', { deviceID: randomUUID() }, 403);
    await api(actor, 'POST', 'WorkDays', { user_ID: adminID, date: '2040-02-01', mode: 'HOME' }, 403);
  }
  const work = await api(user, 'POST', 'WorkDays', { user_ID: userID, date: '2040-02-01', mode: 'HOME', startTime: '08:00:00', endTime: '17:00:00' }, 201);
  await api(keyUser, 'DELETE', `WorkDays(${work.ID})`, undefined, 403);
  await api(user, 'DELETE', `WorkDays(${work.ID})`, undefined, 204);
});

test('key users create regular accounts in their company and set only the initial password', async () => {
  const data = { company_ID: companyID, email: 'new-user@example.com', displayName: 'New user' };
  for (const role of ['KEY_USER', 'ADMIN']) await api(keyUser, 'POST', 'Users', { ...data, role }, 403);
  await api(keyUser, 'POST', 'Users', { ...data, company_ID: randomUUID() }, 403);
  const added = await api(keyUser, 'POST', 'Users', data, 201);assert.equal(added.role, 'USER');
  await api(keyUser, 'POST', 'setUserPassword', { userID: added.ID, password });
  await login(data.email);
  await api(keyUser, 'POST', 'setUserPassword', { userID: added.ID, password }, 403);
  await api(keyUser, 'DELETE', `Users(${added.ID})`, undefined, 403);
  await api(admin, 'PATCH', `Users(${added.ID})`, { role: 'KEY_USER' });
  await api(admin, 'DELETE', `Users(${added.ID})`, undefined, 204);
});

test('batch authorization cannot be bypassed by elevation, deep writes or owner changes', async () => {
  const operations = [
    { id: '1', atomicityGroup: 'all', method: 'POST', url: 'Bookings', body: booking(8) },
    { id: '2', atomicityGroup: 'all', method: 'PATCH', url: `Users(${userID})`, body: { role: 'ADMIN' } }
  ].map(row => ({ ...row, headers: { 'content-type': 'application/json', 'x-user-id': adminID } }));
  const result = await api(user, 'POST', '$batch', { requests: operations });
  assert(result.responses.some(row => row.status === 403));
  assert.equal((await api(user, 'GET', "Bookings?$filter=startAt eq 2040-01-08T09:00:00Z")).value.length, 0);
  await api(keyUser, 'POST', 'Users', { email: 'deep@example.com', displayName: 'Deep', company_ID: companyID, bookings: [booking(9, adminID)] }, 400);
  assert.equal((await api(user, 'GET', 'currentUser()')).role, 'USER');
});

test('role changes and deactivation take effect in existing sessions and preserve the last administrator', async () => {
  await api(admin, 'PATCH', `Users(${adminID})`, { role: 'USER' }, 409);
  await api(admin, 'PATCH', `Users(${adminID})`, { active: false }, 409);
  await api(admin, 'DELETE', `Users(${adminID})`, undefined, 409);
  await api(admin, 'PATCH', `Users(${keyID})`, { role: 'USER' });
  await api(keyUser, 'POST', 'Users', { company_ID: companyID, email: 'revoked@example.com', displayName: 'Revoked' }, 403);
  await api(admin, 'PATCH', `Users(${keyID})`, { role: 'KEY_USER' });
  await api(admin, 'PATCH', `Users(${userID})`, { active: false });
  await api(user, 'GET', 'currentUser()', undefined, 401);
  await api(admin, 'PATCH', `Users(${userID})`, { active: true });
});

test('token displays receive only their resource and cannot obtain user rights', async () => {
  const device = await api(admin, 'POST', 'Displays', { resource_ID: room.ID, name: 'Role test display', deviceId: 'role-test' }, 201);
  const token = (await api(admin, 'POST', 'provisionDevice', { deviceID: device.ID })).value;
  const snapshot = JSON.parse((await api(null, 'POST', 'displaySnapshot', { deviceID: device.ID, token })).value);
  assert.deepEqual(snapshot.Resources.map(row => row.ID), [room.ID]);
  assert(!JSON.stringify(snapshot).includes('passwordHash'));
  await api(null, 'POST', 'displaySnapshot', { deviceID: device.ID, token: 'wrong' }, 403);
  await api(null, 'POST', 'deviceHeartbeat', { deviceID: device.ID, token });
  await api(null, 'POST', 'Bookings', booking(10), 401, { 'x-device-token': token });
  await api(admin, 'DELETE', `Displays(${device.ID})`, undefined, 204);
});

test('password changes and logout revoke sessions; own changes require the current password', async () => {
  await api(user, 'POST', 'setUserPassword', { userID, password: password + 'new', currentPassword: 'wrong' }, 403);
  await api(user, 'POST', 'setUserPassword', { userID, password: password + 'new', currentPassword: password });
  await api(user, 'GET', 'currentUser()', undefined, 401);
  const another = await login('max@example.de');
  await http('/auth/logout', 'POST', {}, another, 204);
  await api(another, 'GET', 'currentUser()', undefined, 401);
});
