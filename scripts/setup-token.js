const cds = require('@sap/cds');
const deployDatabase = require('./deploy');

(async () => {
  try {
    if (process.env.BACKEND_URL) {
      if (!process.argv.includes('--ensure')) console.log('Rust backend manages authentication. Generate a setup token in that backend with: cargo run --locked -- setup-token');
      return;
    }
    await deployDatabase();
    const token = await require('../srv/auth').initialize();
    if (!process.argv.includes('--ensure')) {
      console.log(require('../srv/auth').profileMode() ? 'Profile selection is enabled. Open the app and choose a user; no password or setup token is needed.' : token || 'Administrator setup is already complete. Sign in with your email and password.');
    }
  } finally {
    await cds.db?.disconnect();
  }
})().catch(error => {
  console.error('Administrator setup failed:', error.message);
  process.exitCode = 1;
});
