const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { passwordHash } = require('../srv/auth');

test('setup-token creates a missing token, preserves it and never reopens completed setup', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvroom-setup-'));
  const database = path.join(directory, 'setup.sqlite');
  const tokenFile = path.join(directory, 'setup-token');
  const run = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/setup-token.js', ...args], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, RSVROOM_AUTH_MODE:'password', NODE_ENV: 'production', CDS_ENV: 'production', CDS_REQUIRES_DB_CREDENTIALS_URL: database, RSVROOM_SETUP_TOKEN_FILE: tokenFile }
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  let db;
  try {
    const first = run();
    const token = fs.readFileSync(tokenFile, 'utf8');
    assert.match(token, /^[a-f0-9]{48}$/);
    assert(first.includes(token));
    assert(run().includes(token));
    assert(!run('--ensure').includes(token));
    fs.unlinkSync(tokenFile);
    const recreated = run();
    const newToken = fs.readFileSync(tokenFile, 'utf8');
    assert.notEqual(token, newToken);assert(recreated.includes(newToken));
    db = new Database(database);
    db.prepare('UPDATE rsvroom_Users SET role = ?, passwordHash = ? WHERE email = ?')
      .run('ADMIN', await passwordHash('Setup regression test password'), 'anna@example.com');
    db.close();db = null;
    fs.unlinkSync(tokenFile);
    assert.match(run(), /already complete/);
    assert.equal(fs.existsSync(tokenFile), false);
  } finally {
    db?.close();
    for (const name of ['setup.sqlite', 'setup.sqlite-wal', 'setup.sqlite-shm', 'setup-token']) fs.rmSync(path.join(directory, name), { force: true });
    fs.rmdirSync(directory);
  }
});

test('profile mode upgrades legacy demo roles once and preserves later role assignments', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rsvroom-profiles-'));
  const database=path.join(directory,'profiles.sqlite');
  const tokenFile=path.join(directory,'unused-token');
  const env={...process.env,NODE_ENV:'production',CDS_ENV:'production',RSVROOM_AUTH_MODE:'profile',CDS_REQUIRES_DB_CREDENTIALS_URL:database,RSVROOM_SETUP_TOKEN_FILE:tokenFile};
  const run=script=>{const result=spawnSync(process.execPath,[script],{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:30000,env});assert.equal(result.status,0,result.stderr);return result.stdout;};
  let db;
  try{
    run('scripts/deploy.js');
    db=new Database(database);
    db.prepare("UPDATE rsvroom_Users SET role='USER'").run();db.close();db=null;
    assert.match(run('scripts/setup-token.js'),/no password or setup token is needed/);
    assert.equal(fs.existsSync(tokenFile),false);
    db=new Database(database);
    assert.deepEqual(db.prepare('SELECT role FROM rsvroom_Users ORDER BY role').all().map(row=>row.role),['ADMIN','KEY_USER',...Array(7).fill('USER')]);
    db.prepare("UPDATE rsvroom_Users SET role='ADMIN' WHERE email='max@example.de'").run();
    db.prepare("UPDATE rsvroom_Users SET role='USER' WHERE email='anna@example.com'").run();
    const saved=db.prepare('SELECT ID, role FROM rsvroom_Users ORDER BY ID').all();db.close();db=null;
    run('scripts/setup-token.js');
    db=new Database(database);
    assert.deepEqual(db.prepare('SELECT ID, role FROM rsvroom_Users ORDER BY ID').all(),saved);
  }finally{
    db?.close();
    for(const name of ['profiles.sqlite','profiles.sqlite-wal','profiles.sqlite-shm','unused-token'])fs.rmSync(path.join(directory,name),{force:true});
    fs.rmdirSync(directory);
  }
});
