const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui5Loader = require('./fixtures/ui5.cjs');

function model(api = {}) {
  const load = ui5Loader(
    {
      'rsvroom/service/Api': api,
      'rsvroom/model/i18n': { language: () => 'en', text: (_language, key) => key }
    },
    { innerWidth: 1440, localStorage: { getItem: () => null, setItem() {} } }
  );
  return new (load('rsvroom/model/AppModel'))();
}

test('models keep application instances isolated and reject stale loads after a profile switch', async () => {
  let complete;
  const loading = new Promise(resolve => {
    complete = resolve;
  });
  const first = model({
    auth: async () => ({ mode: 'profile' }),
    request: async () => ({ ID: 'old' }),
    list: () => loading
  });
  const second = model();
  first.filters.floor = 'first-only';
  assert.equal(second.filters.floor, '');
  first.authEpoch = 1;
  const request = first.load();
  first.authEpoch = 2;
  first.authStatus = { mode: 'password' };
  complete([]);
  assert.equal(await request, false);
  assert.equal(first.ready, false);
  assert.equal(first.user, undefined);
  assert.equal(first.authStatus.mode, 'password');
  assert.equal(Object.keys(first.data).length, 0);
});

test('booking model creates and edits with office timezone and rejects invalid input before writing', async () => {
  const calls = [];
  const state = model({
    create: async (...args) => calls.push(['create', ...args]),
    update: async (...args) => calls.push(['update', ...args])
  });
  state.user = { ID: 'user' };
  state.zone = () => 'Europe/Berlin';
  const input = {
    resource: { ID: 'desk' },
    title: ' Meeting ',
    day: '2030-07-01',
    start: '09:00',
    end: '10:00',
    attendees: 1
  };
  await state.bookings.save(input);
  assert.equal(calls[0][0], 'create');
  assert.equal(calls[0][2].startAt, '2030-07-01T07:00:00.000Z');
  assert.equal(calls[0][2].title, 'Meeting');
  assert.equal(calls[0][2].user_ID, 'user');
  await state.bookings.save({ ...input, booking: { ID: 'booking', user_ID: 'owner' } });
  assert.equal(calls[1][0], 'update');
  assert.equal(calls[1][2], 'booking');
  assert.equal(calls[1][3].user_ID, 'owner');
  await assert.rejects(state.bookings.save({ ...input, title: ' ' }), /checkRequired/);
  await assert.rejects(state.bookings.save({ ...input, start: '11:00' }), /invalidInterval/);
  assert.equal(calls.length, 2);
});

test('work week model retains failed drafts and submits create, update and delete together', async () => {
  const state = model();
  state.user = { ID: 'user' };
  state.siteID = 'office';
  state.data.WorkDays = [
    {
      ID: 'saved',
      user_ID: 'user',
      date: '2030-07-01',
      mode: 'HOME',
      startTime: '08:00:00',
      endTime: '17:00:00'
    }
  ];
  const draft = state.workWeek.draft('2030-07-01');
  draft[0].mode = '';
  Object.assign(draft[1], { ID: 'existing', mode: 'HOME' });
  draft[2].mode = 'OFFICE';
  state.weekDirty = true;
  assert.equal(state.data.WorkDays[0].mode, 'HOME');
  assert.equal(state.workWeek.draft('2030-07-01'), draft);
  state.api.batch = async () => {
    throw new Error('networkError');
  };
  await assert.rejects(state.workWeek.save(), /networkError/);
  assert.equal(state.weekDirty, true);
  assert.equal(state.weekDraft, draft);
  let sent;
  state.api.batch = async operations => {
    sent = operations;
  };
  await state.workWeek.save();
  assert.equal(sent.map(row => row.method).join(','), 'DELETE,PATCH,POST');
  assert.equal(sent[1].body.site_ID, null);
  assert.equal(sent[2].body.site_ID, 'office');
  assert.equal(state.weekDirty, false);
  assert.equal(state.weekCacheKey, null);
});

test('MVC dependencies keep UI construction out of controllers and network access out of views', () => {
  for (const layer of ['model', 'controller', 'view']) {
    const directory = path.join(__dirname, '../app', layer);
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(directory, file), 'utf8');
      if (layer === 'model')
        assert.doesNotMatch(source, /rsvroom\/(view|controller|control)\//, file);
      if (layer === 'controller') assert.doesNotMatch(source, /new U\./, file);
      if (layer === 'view')
        assert.doesNotMatch(source, /(?:\.api\.|\bfetch\s*\(|rsvroom\/model\/Api)/, file);
    }
  }
});
