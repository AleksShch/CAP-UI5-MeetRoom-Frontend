sap.ui.define(
  ['sap/ui/core/mvc/Controller', 'sap/ui/model/json/JSONModel', 'rsvroom/model/PageData'],
  function (Controller, JSONModel, PageData) {
    'use strict';
    return Controller.extend('rsvroom.controller.BaseController', {
      onInit: function () {
        this.app = this.getOwnerComponent().app;
        this.model = this.app.model;
        const model = new JSONModel({});
        model.setSizeLimit(10000);
        this.getView().setModel(model, 'page');
      },
      onExit: function () {
        const model = this.getView().getModel('page');
        model?.setData({});
        model?.destroy();
      },
      setData: function (data) {
        this.getView().getModel('page').setData(data);
      },
      data: function (event) {
        return event.getSource().getBindingContext('page')?.getObject();
      },
      onNav: function (event) {
        this.app.nav(event.getSource().data('route') || this.data(event)?.route);
      },
      onRefresh: function () {
        return this.app.run(() => this.app.reload());
      },
      onReserve: function () {
        return this.app.dialogs.booking(null, this.model.maps.Resources[this.model.selectedID]);
      },
      onEditBooking: function (event) {
        const id = event.getSource().data('booking') || this.data(event)?.ID;
        return this.app.dialogs.booking(this.model.maps.Bookings[id]);
      },
      onCancelBooking: function (event) {
        return this.app.controllers.Reservations.cancelBooking(
          this.model.maps.Bookings[this.data(event).ID]
        );
      },
      onDeleteBooking: function (event) {
        return this.app.controllers.Reservations.deleteBooking(
          this.model.maps.Bookings[this.data(event).ID]
        );
      },
      onOpenBooking: function (event) {
        const b = this.data(event),
          r = this.model.maps.Resources[b.resource_ID];
        this.app.nav(this.model.resourceRoute(r), { id: r.ID });
      },
      onPersonResource: function (event) {
        const p = this.data(event);
        this.model.filters.date = p.day;
        this.app.nav('desk', { id: p.resourceID });
      },
      onAddUser: function () {
        return this.app.dialogs.admin('Users');
      },
      onLanguage: function (event) {
        this.app.onLanguage(event);
      },
      onFullscreen: function () {
        this.app.run(() => document.documentElement.requestFullscreen());
      },
      PageData: PageData
    });
  }
);
