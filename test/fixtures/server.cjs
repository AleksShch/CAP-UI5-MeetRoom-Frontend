const cds = require('@sap/cds');
require('../../server');

(async () => {
  await cds.plugins;
  const server = await cds.server({ port: 0, in_memory: true });
  if (process.env.RSVROOM_TEST_SETUP) await require('../../srv/auth').initialize();
  else await require('./auth.cjs').seedAuth();
  process.send({ port: server.address().port });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
