const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function properties(relative) {
  const entries = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#')).map(line => {
      const separator = line.indexOf('=');
      assert.ok(separator > 0, `Invalid property in ${relative}: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    });
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, `Duplicate keys in ${relative}`);
  return Object.fromEntries(entries);
}

test('English and German bundles have complete keys, matching placeholders and valid text', () => {
  for (const [folder, name] of [['app/i18n', 'i18n'], ['_i18n', 'messages']]) {
    const base = properties(`${folder}/${name}.properties`);
    const en = properties(`${folder}/${name}_en.properties`);
    const de = properties(`${folder}/${name}_de.properties`);
    assert.deepEqual(base, en, 'Fallback must be English');
    assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
    for (const key of Object.keys(en)) {
      assert.ok(en[key].trim() && de[key].trim(), `Empty translation: ${key}`);
      assert.deepEqual(en[key].match(/\{\d+\}/g) || [], de[key].match(/\{\d+\}/g) || [], `Placeholders: ${key}`);
      assert.doesNotMatch(de[key], /\p{L}\?\p{L}|\uFFFD/u, `Broken encoding: ${key}`);
      assert.doesNotMatch(en[key] + de[key], /\p{Script=Cyrillic}/u, `Unexpected Russian text: ${key}`);
    }
  }
  const texts = properties('app/i18n/i18n.properties');
  const files = fs.readdirSync(path.join(root, 'app'), { recursive: true }).filter(file => /\.(js|xml)$/.test(file));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'app', file), 'utf8');
    for (const match of source.matchAll(/\{i18n>([^}]+)\}/g)) {
      assert.ok(Object.hasOwn(texts, match[1]), `Missing XML key ${match[1]} in ${file}`);
    }
    for (const match of source.matchAll(/this\.(?:t|button|field|title|empty|badge)\('([^']+)'/g)) {
      assert.ok(Object.hasOwn(texts, match[1]), `Missing key ${match[1]} in ${file}`);
    }
  }
});

function loadModule(file, dependencies, globals = {}) {
  let module;
  const requireUI5 = { toUrl: value => '/' + value.replace('rsvroom/', '') };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    ...globals, sap: { ui: { require: requireUI5, define: (names, factory) => { module = factory(...names.map(name => dependencies[name])); } } }
  }, { filename: file });
  return module;
}

test('language changes synchronize UI5, document and storage with English fallback', async () => {
  for (const storageAvailable of [true, false]) {
    const stored = new Map([['rsvroom.language', 'ru']]);
    const document = { documentElement: {}, title: '' };
    let uiLanguage;
    const i18n = loadModule('app/model/i18n.js', {
      'sap/base/i18n/Localization': { setLanguage: locale => { uiLanguage = locale; } },
      'sap/base/i18n/ResourceBundle': { create: async ({ locale }) => {
        const texts = properties(`app/i18n/i18n_${locale}.properties`);
        return { hasText: key => Object.hasOwn(texts, key), getText: (key, args = []) => texts[key].replace(/\{(\d+)\}/g, (_, i) => args[i]) };
      } }
    }, { document, localStorage: {
      getItem: key => { if (!storageAvailable) throw new Error(); return stored.get(key); },
      setItem: (key, value) => { if (!storageAvailable) throw new Error(); stored.set(key, value); }
    } });
    await i18n.load();
    assert.equal(i18n.language(), 'en');
    i18n.setLanguage('de');
    assert.equal(i18n.language(), 'de');
    assert.equal(uiLanguage, 'de');
    assert.equal(document.documentElement.lang, 'de');
    assert.equal(document.title, 'RsvRoom · Dein Platz zum Arbeiten');
    assert.equal(i18n.text('de', 'remainingMinutes', [12]), 'Noch 12 Minuten');
    if (storageAvailable) assert.equal(stored.get('rsvroom.language'), 'de');
    i18n.setLanguage('fr');
    assert.equal(i18n.language(), 'en');
  }
});

test('API sends the selected language on ordinary and batch requests', async () => {
  const calls = [];
  let locale = 'de';
  const api = loadModule('app/service/Api.js', { 'rsvroom/model/i18n': { language: () => locale } }, {
    window: {}, location: { origin: 'http://localhost:4004' }, URL, URLSearchParams, AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url: String(url), ...options });
      return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ value: [], responses: [] }) };
    }
  });
  await api.list('Sites');
  assert.equal(calls.at(-1).headers['Accept-Language'], 'de');
  await api.batch([{ method: 'POST', url: 'WorkDays', body: {} }]);
  assert.equal(calls.at(-1).headers['Accept-Language'], 'de');
  assert.equal(JSON.parse(calls.at(-1).body).requests[0].headers['accept-language'], 'de');
  locale = 'en';
  await api.list('Sites');
  assert.equal(calls.at(-1).headers['Accept-Language'], 'en');
});
