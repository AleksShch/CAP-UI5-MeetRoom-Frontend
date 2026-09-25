sap.ui.define(['rsvroom/service/Notifications'], function (U) {
  'use strict';
  return class AdminController {
    constructor(app) {
      this.app = app;
      this.model = app.model;
    }
    removeEntry(entity, row) {
      return U.MessageBox.confirm(this.model.t('deleteConfirm'), {
        onClose: action => {
          if (action === U.MessageBox.Action.OK)
            this.app.run(async () => {
              await this.model.api.remove(this.model.adminTarget(entity), row.ID);
              await this.app.reload();
            });
        }
      });
    }

    saveEntry({ initialPassword, controls, entity, row, save, dialog }) {
      return this.app.run(async () => {
        if (initialPassword && initialPassword.getValue().length < 12)
          throw new Error('PASSWORD_LENGTH');
        const payload = {};
        for (const [key, { control, kind, required }] of Object.entries(controls)) {
          let value =
            kind === 'bool'
              ? control.getSelected()
              : Array.isArray(kind) || this.model.data[this.model.adminTarget(kind)]
                ? control.getSelectedKey()
                : control.getValue();
          if (required && (value === '' || value == null))
            throw new Error(this.model.t('checkRequired'));
          if (kind === 'number') value = value === '' ? null : Number(value);
          else if (kind !== 'bool' && value === '') value = null;
          payload[key] = value;
        }
        if (entity === 'ParkingLots' && !row) payload.kind = 'PARKING';
        if (entity === 'Buildings' && !row) payload.kind = 'BUILDING';
        if (entity === 'ParkingSpaces') {
          payload.type = 'PARKING';
          payload.capacity = 1;
        }
        save.setEnabled(false);
        try {
          if (row) await this.model.api.update(this.model.adminTarget(entity), row.ID, payload);
          else {
            const created = await this.model.api.create(this.model.adminTarget(entity), payload);
            if (entity === 'ParkingLots') {
              this.model.filters.building = created.ID;
              this.model.filters.floor = '';
            }
            if (entity === 'ParkingLevels') this.model.filters.floor = created.ID;
            if (initialPassword)
              await this.model.api.action('setUserPassword', {
                userID: created.ID,
                password: initialPassword.getValue()
              });
          }
          dialog.close();
          await this.app.reload();
          U.MessageToast.show(this.model.t('saved'));
        } finally {
          save.setEnabled(true);
        }
      });
    }

    async provisionDisplay(device) {
      const token = await this.model.api.action('provisionDevice', { deviceID: device.ID });
      const resource = this.model.maps.Resources[device.resource_ID];
      const url =
        location.origin +
        '/#display/' +
        (resource.type === 'PARKING' ? 'parking' : resource.type === 'ROOM' ? 'room' : 'desk') +
        '/' +
        resource.ID +
        '?' +
        new URLSearchParams({ device: device.ID, token });
      this.app.dialogs.displayLink(url);
      await this.app._load();
    }
  };
});
