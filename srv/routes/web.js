const express = require('express');
const path = require('node:path');
const { root } = require('../model/WebConfig');
const WebController = require('../controller/WebController');

function mountWeb(app, options = {}) {
  const controller = new WebController(options);
  app.use('/resources', express.static(path.join(root, 'gen/ui/resources'), { maxAge: '1d' }));
  app.get('/app-config.js', controller.config.bind(controller));
  app.get(
    /^\/(dashboard|office|floor|floor-editor|desk|room|rooms|spaces|parking|parking-lot|parking-space|bookings|schedule|team|users|admin|display)(\/.*)?$/,
    controller.index.bind(controller)
  );
}
module.exports = { mountWeb, root };
