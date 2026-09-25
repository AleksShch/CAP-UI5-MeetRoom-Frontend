const cds = require('@sap/cds');
const { passwordHash } = require('../../srv/auth');
const password = 'RsvRoom test password 2026!';

async function seedAuth() {
  if(require('../../srv/auth').profileMode())return require('../../srv/auth').initialize();
  const db = await cds.connect.to('db');
  const encoded = await passwordHash(password);
  for (const [id, role] of [['1', 'ADMIN'], ['2', 'KEY_USER'], ['3', 'USER']]) {
    await db.run(cds.ql.UPDATE('rsvroom.Users').set({ role, passwordHash: encoded }).where({ ID: '60000000-0000-4000-8000-00000000000' + id }));
  }
}

module.exports = { seedAuth, password };
