sap.ui.define(['rsvroom/service/Notifications'], function (U) {
  'use strict';
  return class PlanningController {
    constructor(app) {
      this.app = app;
      this.model = app.model;
    }
    saveSchedule(save) {
      return this.app.run(async () => {
        save.setEnabled(false);
        try {
          await this.model.workWeek.save();
          await this.app.reload();
          U.MessageToast.show(this.model.t('scheduled'));
        } finally {
          save.setEnabled(true);
        }
      });
    }
  };
});
