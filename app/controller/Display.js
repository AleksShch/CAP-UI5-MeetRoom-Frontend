sap.ui.define([], function () {
  'use strict';
  return class DisplayController {
    constructor(app) {
      this.app = app;
      this.model = app.model;
    }
    async heartbeat() {
      const query = this.model.routeArgs?.['?query'] || {};
      if (!query.device || !query.token) return;
      try {
        await this.model.api.action('deviceHeartbeat', {
          deviceID: query.device,
          token: query.token
        });
        this.model.deviceError = false;
      } catch {
        this.model.deviceError = true;
      }
    }
  };
});
