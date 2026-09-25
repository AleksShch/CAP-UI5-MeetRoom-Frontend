const express = require('express');
const path = require('node:path');
const backendProxy = require('./middleware/backendProxy');
const { mountWeb, root } = require('./web');

function createApp({ backendUrl = process.env.BACKEND_URL, proxyTimeout = 20000 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Keep the browser's Host and Origin together: Rust checks them on writes.
  // Register before any body parser so JSON batches and uploads remain intact.
  app.use(backendProxy(backendUrl, proxyTimeout));
  mountWeb(app, { remote: true });
  app.use(express.static(path.join(root, 'app')));
  return app;
}

async function start(options = {}) {
  const app = createApp(options);
  const port = options.port ?? Number(process.env.PORT || 4004);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });
  console.log(
    `RsvRoom frontend listening on port ${server.address().port}; API forwarded to Rust backend.`
  );
  return server;
}

module.exports = { createApp, start };
