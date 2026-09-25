sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.Team', {
    refresh: function () {
      this.setData(this.PageData.team(this.model));
    },
    onTeam: function (e) {
      this.model.teamID = e.getSource().getSelectedKey();
      this.refresh();
    },
    onDay: function (e) {
      this.model.teamDate = e.getSource().getValue();
      this.refresh();
    }
  });
});
