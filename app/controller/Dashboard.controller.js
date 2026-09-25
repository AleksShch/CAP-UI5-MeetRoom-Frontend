sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.Dashboard', {
    refresh: function () {
      this.setData(this.PageData.dashboard(this.model));
    },
    onDesk: function () {
      const d = this.getView().getModel('page').getProperty('/desk');
      this.app.nav('desk', { id: d.resource_ID });
    },
    onEditDesk: function () {
      const d = this.getView().getModel('page').getProperty('/desk');
      this.app.dialogs.booking(this.model.maps.Bookings[d.ID]);
    }
  });
});
