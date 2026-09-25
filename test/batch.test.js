let authCookie;
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');

let child, base, room, user, logs = '';

async function request(method, endpoint, data, expected = 200, contentType = 'application/json') {
  const response = await fetch(`${base}/${endpoint}`, {
    method,
    headers: { Cookie: authCookie, ...(data === undefined ? {} : { 'content-type': contentType }) },
    body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data)
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${endpoint}: ${text}`);
  return text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
}

const booking = (day, extra = {}) => ({
  resource_ID: room.ID, user_ID: user.ID, title: `Batch review ${day}`,
  startAt: `2038-06-${String(day).padStart(2, '0')}T09:00:00Z`,
  endAt: `2038-06-${String(day).padStart(2, '0')}T10:00:00Z`, ...extra
});

const operation = (id, body) => ({
  id: String(id), atomicityGroup: 'changes', method: 'POST', url: 'Bookings',
  headers: { 'content-type': 'application/json' }, body
});

async function bookingsFor(day) {
  return (await request('GET', `Bookings?$filter=title eq 'Batch review ${day}'`)).value;
}

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
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  base = `http://127.0.0.1:${port}/odata/v4/booking`;
  const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userID:'60000000-0000-4000-8000-000000000001'})});
  assert.equal(login.status,200,await login.clone().text());
  authCookie=login.headers.get('set-cookie').split(';')[0];
  room = (await request('GET', 'Resources')).value.find(resource => resource.type === 'ROOM');
  user = (await request('GET', 'Users')).value[0];
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
});

test('ordinary booking writes reject timestamps without an offset, including property PUT', async () => {
  await request('POST', 'Bookings', booking(1, { startAt: '2038-06-01T09:00:00' }), 400);
  const created = await request('POST', 'Bookings', booking(1), 201);
  await request('PATCH', `Bookings(${created.ID})`, { endAt: '2038-06-01T11:00:00' }, 400);
  await request('PUT', `Bookings(${created.ID})/startAt`, { value: '2038-06-01T08:00:00' }, 400);
  await request('PUT', `Bookings(${created.ID})/%73tartAt`, { value: '2038-06-01T08:00:00' }, 400);
  const stored = await request('GET', `Bookings(${created.ID})`);
  assert.equal(stored.startAt, '2038-06-01T09:00:00.000Z');
  assert.equal(stored.endAt, '2038-06-01T10:00:00.000Z');
  await request('PUT', `Bookings(${created.ID})/startAt`, { value: '2038-06-01T10:30:00+02:00' });
  assert.equal((await request('GET', `Bookings(${created.ID})`)).startAt, '2038-06-01T08:30:00.000Z');
});

test('JSON batch rejects an ambiguous timestamp and rolls back the atomicity group', async () => {
  const result = await request('POST', '$batch', { requests: [
    operation(1, booking(2)),
    operation(2, booking(2, { startAt: '2038-06-02T11:00:00Z', endAt: '2038-06-02T12:00:00' }))
  ] });
  assert.ok(result.responses.some(response => response.status === 400), JSON.stringify(result));
  assert.equal((await bookingsFor(2)).length, 0);
});

test('multipart changesets reject an ambiguous timestamp before it can be normalized', async () => {
  const body = [
    '--batch_review', 'Content-Type: multipart/mixed; boundary=changeset_review', '',
    '--changeset_review', 'Content-Type: application/http', 'Content-Transfer-Encoding: binary',
    'Content-ID: 1', '', 'POST Bookings HTTP/1.1', 'Content-Type: application/json', '',
    JSON.stringify(booking(3, { startAt: '2038-06-03T09:00:00' })),
    '--changeset_review--', '--batch_review--', ''
  ].join('\r\n');
  const result = await request('POST', '$batch', body, 200, 'multipart/mixed; boundary=batch_review');
  assert.match(result, /HTTP\/1\.1 400 Bad Request/);
  assert.match(result, /explicit UTC offset/);
  assert.equal((await bookingsFor(3)).length, 0);
});

test('parallel writes in one atomicity group cannot create overlapping bookings', async () => {
  const result = await request('POST', '$batch', { requests: [
    operation(1, booking(4)), operation(2, booking(4))
  ] });
  assert.ok(result.responses.some(response => response.status === 409), JSON.stringify(result));
  assert.equal((await bookingsFor(4)).length, 0, 'The entire failed group must roll back.');
});

test('disjoint bookings in an atomicity group commit and preserve explicit offsets', async () => {
  const result = await request('POST', '$batch', { requests: [
    operation(1, booking(5)),
    operation(2, booking(5, { startAt: '2038-06-05T12:00:00+02:00', endAt: '2038-06-05T13:00:00+02:00' }))
  ] });
  assert.deepEqual(result.responses.map(response => response.status), [201, 201]);
  const stored = await bookingsFor(5);
  assert.equal(stored.length, 2);
  assert.ok(stored.some(row => row.startAt === '2038-06-05T10:00:00.000Z'));
});
