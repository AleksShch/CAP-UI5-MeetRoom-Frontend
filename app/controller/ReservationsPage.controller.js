sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.ReservationsPage', {
    refresh: function () {
      this.setData(this.PageData.reservations(this.model));
    },
    onFilter: function () {
      Object.assign(this.model.filters, this.getView().getModel('page').getProperty('/filters'));
      this.refresh();
    },
    onEquipment: function (e) {
      this.model.filters.equipment = e.getSource().getSelectedKeys();
      this.refresh();
    },
    onBuilding: function (e) {
      this.model.filters.building = e.getSource().getSelectedKey();
      this.model._ensureLocation();
      this.model.selectedID = null;
      this.refresh();
    },
    onFloor: function (e) {
      this.model.filters.floor = e.getSource().getSelectedKey();
      this.model.selectedID = null;
      this.refresh();
    },
    onMode: function (e) {
      this.model.filters.mode = e.getParameter('item').getKey();
      this.refresh();
    },
    onResource: function (e) {
      this.app.controllers.Reservations.selectBookingResource(e.getSource().getSelectedKey());
    },
    onDetails: function (e) {
      this.app.controllers.Reservations.selectBookingResource(this.data(e).ID);
    },
    onMapSelect: function (e) {
      this.app.controllers.Reservations.selectBookingResource(e.getParameter('resourceId'));
    },
    onViewport: function (e) {
      this.model.viewerViews ||= {};
      this.model.viewerViews[this.model.filters.floor] = e.getParameter('view');
    },
    onSlot: function (e) {
      const slot = this.data(e);
      this.model.filters.start = slot.start;
      this.model.filters.end = slot.end;
      this.refresh();
    },
    onEditSelected: function () {
      const id = this.getView().getModel('page').getProperty('/selected/ownBooking');
      this.app.dialogs.booking(this.model.maps.Bookings[id]);
    },
    onParkingAdmin: function () {
      this.model.adminEntity = 'ParkingLots';
      this.app.nav('admin');
    },
    onAddParkingSpace: function () {
      this.app.dialogs.admin('ParkingSpaces', null, { floor_ID: this.model.filters.floor });
    },
    onEditor: function () {
      this.app.controllers.FloorEditor.openFloorEditor(this.model.filters.floor);
    }
  });
});
