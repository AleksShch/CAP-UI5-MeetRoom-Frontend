const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createApp } = require('../srv/frontend-server');

async function listen(t, handler) {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('proxy forwards cookies, original Origin/Host, query strings and atomic batch bodies', async t => {
  const seen = [];
  const backend = await listen(t, async (req, res) => {
    let body = '';for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'ACCESS_DENIED', message: 'ACCESS_DENIED' } }));return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/auth/login') res.setHeader('set-cookie', 'rsvroom_session=test; HttpOnly; SameSite=Strict; Path=/');
    res.end(JSON.stringify(req.url.includes('$batch') ? { responses: [{ id: '1', status: 201, body: { ID: 'saved' } }] } : { value: [] }));
  });
  const frontend = await listen(t, createApp({ backendUrl: backend.url }));
  const response = await fetch(frontend.url + '/auth/login', {
    method: 'POST', headers: { origin: frontend.url, 'content-type': 'application/json' }, body: '{"userID":"user"}'
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const body = JSON.stringify({ requests: [{ id: '1', atomicityGroup: 'save', method: 'PATCH', url: 'Floors(id)', body: { planImage: 'data:image/png;base64,' + 'a'.repeat(150000) } }] });
  const batch = await fetch(frontend.url + '/odata/v4/booking/$batch', {
    method: 'POST', headers: { cookie, origin: frontend.url, 'content-type': 'application/json', 'accept-language': 'de' }, body
  });
  assert.equal((await batch.json()).responses[0].status, 201);
  assert.equal(seen.at(-1).body, body);
  assert.equal(seen.at(-1).headers.cookie, cookie);
  assert.equal(seen.at(-1).headers.host, new URL(frontend.url).host);
  assert.equal(seen.at(-1).headers.origin, frontend.url);
  assert.equal(seen.at(-1).headers['accept-language'], 'de');
  const query = '/odata/v4/booking/Bookings?%24filter=status%20eq%20%27CONFIRMED%27&%24skip=100';
  await fetch(frontend.url + query);
  assert.equal(seen.at(-1).url, query);
  const denied = await fetch(frontend.url + '/auth/login', { method: 'POST', headers: { origin: 'https://foreign.example' } });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'ACCESS_DENIED');
  const count = seen.length;
  assert.equal((await fetch(frontend.url + '/auth-unrelated')).status, 404);
  assert.equal(seen.length, count);
});

test('frontend serves UI routes locally and reports backend health and failure without CAP fallback', async t => {
  const backend = await listen(t, (req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });res.end(JSON.stringify({ status: 'unavailable', path: req.url }));
  });
  const frontend = await listen(t, createApp({ backendUrl: backend.url }));
  const config = await (await fetch(frontend.url + '/app-config.js')).text();
  assert.match(config, /"serviceUrl":"\/odata\/v4\/booking\/"/);
  assert.match(config, /"csrfToken":false/);
  for (const route of ['/', '/floor-editor/parking-id', '/parking-space/space-id']) {
    assert.match(await (await fetch(frontend.url + route)).text(), /sap-ui-bootstrap/);
  }
  assert.equal((await fetch(frontend.url + '/health')).status, 503);
  backend.server.closeAllConnections();await new Promise(resolve => backend.server.close(resolve));
  const response = await fetch(frontend.url + '/odata/v4/booking/Companies');
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: { code: 'BACKEND_UNAVAILABLE', message: 'networkError' } });
});

test('remote startup leaves the CAP database untouched', async t => {
  const backend = await listen(t, (_req, res) => res.end('{"status":"ok"}'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvroom-proxy-'));
  const database = path.join(directory, 'must-not-be-created.sqlite');
  const child = spawn(process.execPath, ['scripts/start.js'], {
    cwd: path.join(__dirname, '..'), windowsHide: true,
    env: { ...process.env, BACKEND_URL: backend.url, PORT: '0', CDS_REQUIRES_DB_CREDENTIALS_URL: database },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit');child.kill();await exited; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(output || 'Frontend startup timed out')), 10000);
    child.on('error', error => { clearTimeout(timeout);reject(error); });
    child.once('exit', code => { clearTimeout(timeout);reject(new Error(`Frontend exited: ${code} ${output}`)); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timeout);resolve(match[1]); }
    });
  });
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  assert.equal(fs.existsSync(database), false);
});

test('remote target must be an origin without credentials, paths or query strings', () => {
  for (const url of ['file:///tmp', 'http://user:password@localhost:4005', 'http://localhost:4005/api', 'http://localhost:4005/?token=secret']) {
    assert.throws(() => createApp({ backendUrl: url }), /BACKEND_URL/);
  }
});
