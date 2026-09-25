const fs = require('node:fs/promises');
const path = require('node:path');
const cds = require('@sap/cds');

async function deployDatabase() {
  const database = cds.env.requires.db.credentials.url;
  if (database !== ':memory:') {
    await fs.mkdir(path.dirname(path.resolve(cds.root, database)), { recursive: true });
  }

  const model = await cds.load('*');
  const db = await cds.connect.to('db');
  const initialized = await db.run("SELECT 1 FROM sqlite_schema WHERE name = 'cds_model' AND type = 'table'");

  // Schema evolution preserves existing rows. Suppress CSV loading after the
  // first successful deployment so restarts also preserve edited demo records.
  await cds.deploy(model, { schema_evolution: 'auto' }, initialized.length ? {} : undefined).to(db);
  return db;
}

module.exports = deployDatabase;

if (require.main === module) {
  deployDatabase()
    .then(db => db.disconnect())
    .catch(error => {
      console.error('Database deployment failed:', error);
      process.exitCode = 1;
    });
}
