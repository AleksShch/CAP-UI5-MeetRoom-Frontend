sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.Users', {
    refresh: function () {
      this.setData(this.PageData.users(this.model));
    }
  });
});
