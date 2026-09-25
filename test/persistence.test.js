const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const png = require('./fixtures/plan-image.cjs');

test('repeated deployment preserves bookings, edited seed rows and deleted seed rows', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvroom-persistence-'));
  const database = path.join(directory, 'test.sqlite');
  let connection;
  const deploy = (beforeParking = false) => {
    const oldModel = `const cds=require('@sap/cds'),fs=require('node:fs');(async()=>{
      const model=await cds.load('*');
      for(const name of ['rsvroom.Buildings','BookingService.Buildings'])delete model.definitions[name].elements.kind;
      const sources={};
      for(const file of fs.readdirSync('db/data').filter(name=>name.endsWith('.csv'))){
        const [columns,...rows]=cds.parse.csv(fs.readFileSync('db/data/'+file,'utf8'));
        const keep=columns.map((key,i)=>key==='kind'?-1:i).filter(i=>i>=0);
        const legacy=rows.filter(row=>!row[0].startsWith('d'));
        sources[file]=[columns,...legacy].map(row=>keep.map(i=>JSON.stringify(row[i]??'')).join(';')).join('\\n');
      }
      const db=await cds.connect.to('db');await cds.deploy(model,{schema_evolution:'auto'},sources).to(db);await db.disconnect();
    })().catch(error=>{console.error(error);process.exitCode=1;});`;
    const result = spawnSync(process.execPath, beforeParking ? ['-e', oldModel] : ['scripts/deploy.js'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, NODE_ENV: 'production', CDS_ENV: 'production', CDS_REQUIRES_DB_CREDENTIALS_URL: database }
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  try {
    deploy(true);
    connection = new Database(database);
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM rsvroom_Sites').get().n, 3);
    const company = connection.prepare('SELECT ID FROM rsvroom_Companies').get();
    const resource = connection.prepare('SELECT ID FROM rsvroom_Resources').get();
    const floor = connection.prepare('SELECT ID FROM rsvroom_Floors').get();
    const planImage = 'data:image/png;base64,' + png(1000, 600).toString('base64');
    connection.prepare('UPDATE rsvroom_Floors SET planImage = ?, planImageName = ? WHERE ID = ?').run(planImage, 'office.png', floor.ID);
    connection.prepare('INSERT INTO rsvroom_FloorObjects (ID, floor_ID, name, type, x, y, width, height, radius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('90000000-0000-4000-8000-000000000098', floor.ID, 'Persistent area', 'ZONE', 420, 180, 310, 220, 16);
    const user = connection.prepare('SELECT ID FROM rsvroom_Users').get();
    connection.prepare('UPDATE rsvroom_Companies SET name = ? WHERE ID = ?').run('Renamed company', company.ID);
    connection.prepare('DELETE FROM rsvroom_CompanyDomains WHERE domain = ?').run('example.de');
    connection.prepare('INSERT INTO rsvroom_Bookings (ID, resource_ID, user_ID, title, startAt, endAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run('90000000-0000-4000-8000-000000000099', resource.ID, user.ID, 'Persistent booking', '2035-01-01T09:00:00.000Z', '2035-01-01T10:00:00.000Z');
    connection.close();
    connection = undefined;
    deploy();
    deploy();
    connection = new Database(database);
    assert.equal(connection.prepare('SELECT name FROM rsvroom_Companies WHERE ID = ?').get(company.ID).name, 'Renamed company');
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM rsvroom_CompanyDomains WHERE domain = ?').get('example.de').n, 0);
    assert.equal(connection.prepare('SELECT title FROM rsvroom_Bookings').get().title, 'Persistent booking');
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM rsvroom_Resources').get().n, 6);
    assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM rsvroom_Buildings WHERE kind = 'BUILDING'").get().n, 3);
    assert.equal(connection.prepare('SELECT planImage FROM rsvroom_Floors WHERE ID = ?').get(floor.ID).planImage, planImage);
    const area = connection.prepare("SELECT x, y, width, height, radius FROM rsvroom_FloorObjects WHERE ID = '90000000-0000-4000-8000-000000000098'").get();
    assert.deepEqual(area, { x: 420, y: 180, width: 310, height: 220, radius: 16 });
  } finally {
    connection?.close();
    for (const name of ['test.sqlite', 'test.sqlite-wal', 'test.sqlite-shm']) {
      fs.rmSync(path.join(directory, name), { force: true });
    }
    fs.rmdirSync(directory);
  }
});
