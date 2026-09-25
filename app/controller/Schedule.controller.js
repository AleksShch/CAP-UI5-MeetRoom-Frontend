sap.ui.define(
  ['rsvroom/controller/BaseController', 'rsvroom/model/Time', 'sap/m/MessageBox'],
  function (Base, Time, MessageBox) {
    return Base.extend('rsvroom.controller.Schedule', {
      refresh: function () {
        this.setData(this.PageData.schedule(this.model));
      },
      onDayChange: function () {
        this.model.weekDraft = this.getView()
          .getModel('page')
          .getProperty('/days')
          .map(({ weekday, dateLabel, ...day }) => ({ ...day }));
        this.model.weekDirty = true;
      },
      move: function (days) {
        const move = () => {
          this.model.weekDirty = false;
          this.model.weekStart = Time.addDays(this.model.weekStart, days);
          this.refresh();
        };
        if (this.model.weekDirty)
          MessageBox.confirm(this.model.t('discardChanges'), {
            onClose: a => {
              if (a === MessageBox.Action.OK) move();
            }
          });
        else move();
      },
      onPrevious: function () {
        this.move(-7);
      },
      onNext: function () {
        this.move(7);
      },
      onSave: function () {
        this.onDayChange();
        return this.app.controllers.Planning.saveSchedule(this.byId('save'));
      },
      onPickDesk: function (e) {
        const row = this.data(e);
        Object.assign(this.model.filters, {
          date: row.date,
          start: row.startTime.slice(0, 5),
          end: row.endTime.slice(0, 5)
        });
        this.model.siteID = row.site_ID;
        this.model._ensureLocation();
        this.app.nav('spaces');
      }
    });
  }
);
