sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.AdminPage', {
    refresh: function () {
      this.setData(this.PageData.admin(this.model));
    },
    onEntity: function (e) {
      this.app.controllers.FloorEditor.discardPlan(() => {
        this.model.adminEntity = e.getSource().getSelectedKey();
        if (this.model.adminEntity === 'Plans') this.app.controllers.FloorEditor.openFloorEditor();
        else this.refresh();
      });
    },
    onAdd: function () {
      this.app.dialogs.admin(this.model.adminEntity);
    },
    onEdit: function (e) {
      this.app.dialogs.admin(this.model.adminEntity, this.data(e));
    },
    onRemove: function (e) {
      this.app.controllers.Admin.removeEntry(this.model.adminEntity, this.data(e));
    },
    onFloorEditor: function (e) {
      this.app.controllers.FloorEditor.openFloorEditor(this.data(e)?.ID);
    },
    onOpenLot: function (e) {
      this.app.nav('parkingLot', { id: this.data(e).ID });
    },
    onAddLevel: function (e) {
      this.app.dialogs.admin('ParkingLevels', null, { building_ID: this.data(e).ID });
    },
    onAddSpace: function (e) {
      this.app.dialogs.admin('ParkingSpaces', null, { floor_ID: this.data(e).ID });
    },
    onPassword: function (e) {
      this.app.dialogs.password(this.data(e));
    },
    onProvision: function (e) {
      this.app.run(() => this.app.controllers.Admin.provisionDisplay(this.data(e)));
    }
  });
});
