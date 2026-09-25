sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.Bookings', {
    refresh: function () {
      this.setData(this.PageData.bookings(this.model));
    },
    onScope: function (e) {
      this.model.bookingsScope = e.getParameter('item').getKey();
      this.refresh();
    }
  });
});
