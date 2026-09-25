const { configuration, root } = require('../model/WebConfig');
const path = require('node:path');
const View = require('../view/WebResponse');

module.exports = class WebController {
  constructor({ remote = false } = {}) {
    this.remote = remote;
  }
  config(_req, res) {
    View.configuration(res, configuration(this.remote));
  }
  index(_req, res) {
    res.sendFile(path.join(root, 'app/index.html'));
  }
};
