const cds = require('@sap/cds');
require('../../server');
(async()=>{
  await cds.plugins;
  const server=await cds.server({port:4173,in_memory:true});
  await require('./auth.cjs').seedAuth();
  console.log('UI test server ready on '+server.address().port);
})().catch(error=>{console.error(error);process.exitCode=1;});
