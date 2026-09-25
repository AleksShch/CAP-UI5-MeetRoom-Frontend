sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.DisplayPage', {
    refresh: function () {
      const data = this.PageData.display(this.model);
      this.setData(data);
      const card = this.byId('statusCard');
      if (card) {
        card.toggleStyleClass('reserved', data.state === 'reserved');
        card.toggleStyleClass('unavailable', data.state === 'unavailable');
      }
    }
  });
});
