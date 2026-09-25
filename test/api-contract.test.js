const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi(fetch, config = {}) {
  let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/service/Api.js'), 'utf8'), {
    window: { RSVROOM_CONFIG: config }, location: { origin: 'http://localhost:4004' },
    URL, URLSearchParams, AbortSignal, fetch,
    sap: { ui: { define: (_names, factory) => { api = factory({ language: () => 'en' }); } } }
  });
  return api;
}
const response = data => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });

test('profile selection accepts CAP arrays and Rust value envelopes', async () => {
  const users = [{ ID: 'anna', role: 'ADMIN' }, { ID: 'ola', role: 'USER' }];
  for (const data of [users, { value: users }]) {
    const api = loadApi(async () => response(data));
    assert.deepEqual(await api.auth('profiles'), users);
  }
});

test('Rust mode skips CAP CSRF HEAD and follows relative OData pagination through the proxy', async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (options.method === 'POST') return response({ responses: [] });
    return response(String(url).includes('%24skip=1') ? { value: [{ ID: 'second' }] } : { value: [{ ID: 'first' }], '@odata.nextLink': 'Sites?%24skip=1' });
  }, { csrfToken: false, batchDependencies: false });
  const rows = await api.list('Sites');
  assert.equal(rows.map(row => row.ID).join(','), 'first,second');
  await api.batch([{ method: 'POST', url: 'WorkDays', body: { mode: 'HOME' }, dependsOn: ['previous'] }]);
  assert.equal(calls.some(call => call.method === 'HEAD'), false);
  assert.ok(calls.every(call => call.url.startsWith('http://localhost:4004/odata/v4/booking/') && call.credentials === 'same-origin'));
  assert.equal(JSON.parse(calls.at(-1).body).requests[0].atomicityGroup, 'save');
  assert.equal('dependsOn' in JSON.parse(calls.at(-1).body).requests[0], false);
});

test('CAP batch retains explicit operation dependencies', async () => {
  let body;
  const api = loadApi(async (_url, options) => { body = options.body;return response({ responses: [] }); });
  await api.batch([{ method: 'PATCH', url: 'FloorObjects(id)', dependsOn: ['1'], body: {} }]);
  assert.deepEqual(JSON.parse(body).requests[0].dependsOn, ['1']);
});

test('actions support scalar CAP results and structured Rust display snapshots', async () => {
  const snapshot = { resource: { ID: 'room', floor: { ID: 'floor', building: { ID: 'building', site: { ID: 'site', timeZone: 'Europe/Berlin' } } } }, bookings: [] };
  const api = loadApi(async () => response(snapshot), { csrfToken: false });
  assert.deepEqual(JSON.parse(JSON.stringify(await api.action('displaySnapshot', {}))), snapshot);
  const normalize = require('../app/model/DisplaySnapshot');
  const rows = normalize(snapshot);
  assert.equal(rows.Resources[0].ID, 'room');
  assert.equal(rows.Sites[0].timeZone, 'Europe/Berlin');
  assert.deepEqual(rows.Users, []);
  assert.deepEqual(rows.Companies, []);
  const cap = { Resources: [{ ID: 'room' }], Companies: [{ ID: 'company', active: false }], Bookings: [] };
  assert.deepEqual(normalize(JSON.stringify(cap)), cap);
  assert.equal(await loadApi(async () => response({ value: false }), { csrfToken: false }).action('deviceHeartbeat', {}), false);
});
