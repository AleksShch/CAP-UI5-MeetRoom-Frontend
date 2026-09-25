const cds = require('@sap/cds');
const { mountWeb } = require('./srv/routes/web');

cds.on('bootstrap', app => {
  app.use('/auth', require('./srv/routes/auth')());
  mountWeb(app);
});

module.exports = process.env.BACKEND_URL ? require('./srv/frontend-server').start : cds.server;
