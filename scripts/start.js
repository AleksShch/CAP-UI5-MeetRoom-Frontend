async function start() {
  if (process.env.BACKEND_URL) {
    const server = await require('../srv/frontend-server').start();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(0), 5000).unref();
      server.close(() => { clearTimeout(timeout); process.exit(0); });
    });
    return;
  }
  await require('./deploy')();
  await require('../srv/auth').initialize();
  await require('@sap/cds/bin/serve').exec('all');
}

start().catch(error => {
  console.error('Application startup failed:', error);
  process.exitCode = 1;
});
