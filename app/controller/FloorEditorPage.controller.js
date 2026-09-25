sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.FloorEditorPage', {
    refresh: function () {
      this.setData(this.PageData.floorEditor(this.model));
      Object.assign(this.app.controls, {
        planCanvas: this.byId('canvas'),
        planObjectSelector: this.byId('object'),
        planConfigureButton: this.byId('configure'),
        planGeometryFields: { name: this.byId('name'), radius: this.byId('radius') }
      });
    },
    floor: function () {
      return this.model.maps.Floors[this.model.planFloorID];
    },
    selected: function () {
      return this.model.maps.FloorObjects[this.model.planObjectID];
    },
    editor: function () {
      return this.app.controllers.FloorEditor;
    },
    onLocation: function (e) {
      this.editor().openFloorEditor(e.getSource().getSelectedKey());
    },
    onViewport: function (e) {
      this.model.planViews ||= {};
      this.model.planViews[this.model.planFloorID] = e.getParameter('view');
    },
    select: function (id) {
      this.editor().discardPlan(() => {
        this.model.planObjectID = id;
        this.refresh();
      });
    },
    onSelect: function (e) {
      this.select(e.getParameter('id'));
    },
    onObject: function (e) {
      this.select(e.getSource().getSelectedKey());
    },
    onCreate: function (e) {
      const rectangle = e.getParameter('rectangle');
      this.editor().discardPlan(
        () => this.editor().createPlanObject(this.floor(), rectangle),
        false
      );
    },
    onGeometry: function (e) {
      const { id, rectangle } = e.getParameters();
      this.editor().discardPlan(() => this.editor().savePlanGeometry(id, rectangle), false);
    },
    onInteractionEnd: function () {
      this.editor().renderCreatedPlanObjects();
    },
    onAdd: function () {
      const f = this.floor();
      this.editor().discardPlan(
        () =>
          this.editor().createPlanObject(f, {
            x: 20,
            y: 20,
            width: Math.min(160, f.planWidth - 20),
            height: Math.min(100, f.planHeight - 20)
          }),
        false
      );
    },
    onName: function (e) {
      this.model.planDraft.name = e.getParameter('value');
      this.model.planDirty = true;
    },
    onRadius: function (e) {
      const text = e.getParameter('value'),
        value = text.trim() ? Number(text) : NaN;
      this.model.planDraft.radius = value;
      this.model.planDirty = true;
      if (Number.isFinite(value) && value >= 0)
        this.byId('canvas').previewRadius(this.model.planObjectID, value);
    },
    onType: function (e) {
      const type = e.getSource().getSelectedKey();
      Object.assign(this.model.planDraft, { type, resource_ID: null });
      this.model.planDirty = true;
      this.getView().getModel('page').setProperty('/draft/resource_ID', '');
    },
    onResource: function (e) {
      const id = e.getSource().getSelectedKey(),
        draft = this.model.planDraft;
      draft.resource_ID = id || null;
      if (id)
        draft.type =
          draft.type === 'ZONE' && this.model.maps.Resources[id].type === 'WORKPLACE'
            ? 'ZONE'
            : this.model.resourceObjectType(this.model.maps.Resources[id]);
      this.model.planDirty = true;
      this.getView().getModel('page').setProperty('/draft/type', draft.type);
    },
    onSave: function () {
      this.model.planDraft.name = this.byId('name').getValue();
      const r = this.byId('radius').getValue();
      this.model.planDraft.radius = r.trim() ? Number(r) : NaN;
      return this.editor().savePlanProperties(this.selected());
    },
    onDuplicate: function () {
      this.editor().duplicatePlanObject(this.floor(), this.selected());
    },
    onRemove: function () {
      this.editor().removePlanObject(this.selected());
    },
    onConfigure: function () {
      this.editor().discardPlan(() => this.app.dialogs.area(this.selected()));
    },
    onUpload: function (e) {
      const file = e.getParameter('files')?.[0];
      if (file) this.editor().discardPlan(() => this.editor().uploadFloorImage(this.floor(), file));
    },
    onClear: function () {
      this.editor().clearBackground(this.floor());
    },
    onRefresh: function () {
      this.editor().discardPlan(() => this.app.run(() => this.app.reload()));
    },
    onAdmin: function () {
      this.model.adminEntity = 'ParkingLots';
      this.app.nav('admin');
    }
  });
});
