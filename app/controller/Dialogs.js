sap.ui.define(
  [
    'sap/ui/core/Fragment',
    'sap/ui/model/json/JSONModel',
    'rsvroom/model/Time',
    'rsvroom/model/AdminSchema',
    'rsvroom/model/PageData',
    'sap/m/MessageBox',
    'sap/m/MessageToast'
  ],
  function (Fragment, JSONModel, Time, Schema, PageData, MessageBox, MessageToast) {
    'use strict';
    return class Dialogs {
      constructor(app) {
        this.app = app;
        this.model = app.model;
        this.sequence = 0;
      }
      async open(name, data) {
        const sequence = ++this.sequence,
          epoch = this.model.authEpoch;
        this.app.controls.dialog?.close();
        const id = this.app.getView().createId('dialog' + sequence);
        // Closing fragments keep their own draft and cannot destroy a newer dialog.
        const context = Object.create(this);
        context.fragmentID = id;
        context.vm = new JSONModel({ ...data, mobile: innerWidth < 600, busy: false });
        context.vm.setSizeLimit(10000);
        let dialog;
        try {
          dialog = await Fragment.load({
            id,
            name: 'rsvroom.fragment.' + name,
            controller: context
          });
        } catch (error) {
          context.vm.destroy();
          MessageBox.error(this.model.t('error'));
          console.error(error);
          return;
        }
        if (this.app.exiting || sequence !== this.sequence || epoch !== this.model.authEpoch) {
          dialog.destroy();
          context.vm.destroy();
          return;
        }
        context.dialog = dialog;
        dialog.setModel(context.vm, 'dialog');
        this.app.getView().addDependent(dialog);
        this.app.controls.dialog = dialog;
        dialog.open();
        return dialog;
      }
      byId(id) {
        return Fragment.byId(this.fragmentID, id);
      }
      onClose() {
        this.dialog.close();
      }
      onAfterClose() {
        if (this.app.controls.dialog === this.dialog) this.app.controls.dialog = null;
        this.dialog.destroy();
        this.vm.destroy();
      }
      booking(booking, resource) {
        const m = this.model;
        if (booking && booking.user_ID !== m.user?.ID) {
          MessageBox.error(m.t('OWN_RECORDS_ONLY'));
          return;
        }
        resource = resource || m.maps.Resources[booking?.resource_ID];
        if (!resource) return;
        const zone = m.zone(resource),
          parking = resource.type === 'PARKING';
        return this.open('BookingDialog', {
          booking: booking || null,
          resourceID: resource.ID,
          resources: PageData.options(
            m.data.Resources.filter(
              r =>
                m.place(r).site?.company_ID === m.companyID &&
                r.active &&
                (parking ? r.type === 'PARKING' : r.type !== 'PARKING')
            )
          ),
          parking,
          zone,
          heading: m.t(booking ? 'edit' : 'reserve'),
          submitText: m.t(booking ? 'save' : 'reserve'),
          resourceLabel: m.t(parking ? 'parkingSpace' : 'resource'),
          day: booking ? Time.date(booking.startAt, zone) : m.filters.date,
          start: booking ? Time.clock(booking.startAt, zone) : m.filters.start,
          end: booking ? Time.clock(booking.endAt, zone) : m.filters.end,
          title:
            booking?.title ||
            m.t(
              parking
                ? 'parkingReservationTitle'
                : resource.type === 'ROOM'
                  ? 'meetingTitle'
                  : 'reservationTitle'
            ),
          attendees: booking?.attendeeCount || (resource.type === 'ROOM' ? m.filters.capacity : 1),
          capacity: resource.type === 'ROOM' ? resource.capacity : 1
        });
      }
      onBookingResource() {
        const r = this.model.maps.Resources[this.vm.getProperty('/resourceID')];
        this.vm.setProperty('/zone', this.model.zone(r));
        this.vm.setProperty('/capacity', r.type === 'ROOM' ? r.capacity : 1);
        if (r.type !== 'ROOM') this.vm.setProperty('/attendees', 1);
      }
      onSaveBooking() {
        return this.app.controllers.Reservations.saveBooking({
          title: this.byId('title'),
          day: this.byId('day'),
          start: this.byId('start'),
          end: this.byId('end'),
          resource: this.model.maps.Resources[this.vm.getProperty('/resourceID')],
          booking: this.vm.getProperty('/booking'),
          attendees: this.byId('attendees'),
          save: this.dialog.getBeginButton(),
          dialog: this.dialog
        });
      }
      admin(entity, row, initial = {}) {
        const m = this.model;
        if (!m.isAdmin() && !(m.isKeyUser() && entity === 'Users' && !row)) {
          MessageBox.error(m.t('accessDenied'));
          return;
        }
        const defaults = {
          company_ID: m.companyID,
          site_ID: m.siteID,
          building_ID: m.filters.building,
          floor_ID: m.filters.floor,
          active: true,
          capacity: 1,
          quantity: 1,
          monitorCount: 0,
          planWidth: 1000,
          planHeight: 600,
          countryCode: 'DE',
          timeZone: 'Europe/Berlin',
          locale: 'de-DE',
          startTime: '08:00:00',
          endTime: '17:00:00',
          opensAt: '08:00:00',
          closesAt: '18:00:00',
          dayOfWeek: 1
        };
        if (
          entity === 'ParkingLevels' &&
          !m.adminRows('ParkingLots').some(l => l.ID === defaults.building_ID)
        )
          defaults.building_ID = m.adminRows('ParkingLots').find(l => l.site_ID === m.siteID)?.ID;
        if (
          entity === 'ParkingSpaces' &&
          !m.adminRows('ParkingLevels').some(l => l.ID === defaults.floor_ID)
        )
          defaults.floor_ID = m
            .adminRows('ParkingLevels')
            .find(l => m.maps.Buildings[l.building_ID]?.site_ID === m.siteID)?.ID;
        Object.assign(defaults, initial);
        const fields = Schema.fields[entity].map(([key, label, kind, required]) => {
          const value = row ? row[key] : defaults[key],
            enumeration = Array.isArray(kind),
            association = !!m.data[m.adminTarget(kind)];
          let options = enumeration
            ? kind.map(ID => ({ ID, name: m.t(key === 'role' ? 'role_' + ID : ID) }))
            : association
              ? PageData.options(m.adminRows(kind))
              : [];
          if (['Floors', 'ParkingLevels'].includes(kind))
            options = options.map(r => ({
              ...r,
              name: (m.maps.Buildings[r.building_ID]?.name || '') + ' · ' + r.name
            }));
          if (association && !required) options.unshift({ ID: '', name: m.t('none') });
          return {
            key,
            label: m.t(label),
            kind,
            required: !!required,
            input: kind !== 'bool' && !enumeration && !association,
            select: enumeration || association,
            boolean: kind === 'bool',
            inputType: kind === 'number' ? 'Number' : 'Text',
            value:
              value == null
                ? enumeration
                  ? kind[0]
                  : association && required
                    ? options[0]?.ID || ''
                    : ''
                : String(value),
            boolValue: !!value,
            options,
            enabled: !(
              (row &&
                (key === Schema.parentFields[m.adminTarget(entity)] ||
                  (entity === 'Resources' && key === 'type'))) ||
              (entity === 'Users' && !m.isAdmin() && ['company_ID', 'role'].includes(key))
            )
          };
        });
        return this.open('AdminDialog', {
          entity,
          row: row || null,
          fields,
          heading: m.t(row ? 'edit' : 'newEntry') + ' · ' + m.t(Schema.labels[entity]),
          initialPassword: entity === 'Users' && !row && m.authStatus?.mode === 'password',
          password: ''
        });
      }
      onSaveAdmin() {
        const d = this.vm.getData(),
          controls = Object.fromEntries(
            d.fields.map(f => [
              f.key,
              {
                kind: f.kind,
                required: f.required,
                control: {
                  getSelected: () => f.boolValue,
                  getSelectedKey: () => f.value,
                  getValue: () => f.value
                }
              }
            ])
          );
        return this.app.controllers.Admin.saveEntry({
          entity: d.entity,
          row: d.row,
          controls,
          initialPassword: d.initialPassword ? this.byId('initialPassword') : null,
          save: this.dialog.getBeginButton(),
          dialog: this.dialog
        });
      }
      area(area, preferredType = 'WORKPLACE') {
        const m = this.model;
        if (!m.isAdmin()) {
          MessageBox.error(m.t('accessDenied'));
          return;
        }
        const parking = m.isParkingFloor(m.maps.Floors[area.floor_ID]),
          type =
            parking || area.type === 'PARKING'
              ? 'PARKING'
              : area.type === 'ROOM'
                ? 'ROOM'
                : area.type === 'DESK'
                  ? 'WORKPLACE'
                  : preferredType,
          linked = new Set(m.data.FloorObjects.map(o => o.resource_ID).filter(Boolean));
        const codes = new Set(
            m.data.Resources.filter(r => r.floor_ID === area.floor_ID).map(r => r.code)
          ),
          base = area.name.trim().slice(0, 32);
        let code = base,
          index = 2;
        while (codes.has(code)) code = base + '-' + index++;
        return this.open('AreaDialog', {
          area,
          name: area.name,
          code,
          type,
          capacity: 1,
          resourceID: '',
          types: (parking ? ['PARKING'] : ['WORKPLACE', 'ROOM', 'PARKING']).map(ID => ({
            ID,
            name: m.t(ID)
          })),
          resources: [
            { ID: '', name: m.t('createResource') },
            ...PageData.options(
              m.data.Resources.filter(
                r => r.floor_ID === area.floor_ID && r.active && !linked.has(r.ID)
              )
            )
          ]
        });
      }
      onAreaType() {
        if (this.vm.getProperty('/type') !== 'ROOM') this.vm.setProperty('/capacity', 1);
      }
      onSaveArea() {
        return this.app.controllers.FloorEditor.saveAreaBooking({
          area: this.vm.getProperty('/area'),
          selector: this.byId('resource'),
          name: this.byId('name'),
          code: this.byId('code'),
          type: this.byId('type'),
          capacity: this.byId('capacity'),
          save: this.dialog.getBeginButton(),
          dialog: this.dialog
        });
      }
      profile() {
        const m = this.model;
        return this.open('ProfileDialog', {
          userID: m.user?.ID || m.profiles?.[0]?.ID || '',
          profiles: (m.profiles || []).map(u => ({
            ...u,
            label: u.displayName + ' · ' + m.t('role_' + u.role)
          }))
        });
      }
      account() {
        return this.open('AccountDialog', {
          user: this.model.user,
          roleText: this.model.t('role_' + this.model.user.role)
        });
      }
      onProfile() {
        const id = this.vm.getProperty('/userID');
        this.dialog.close();
        this.app.run(() => this.app.controllers.Account.signInProfile(id));
      }
      onSignOut() {
        this.app.controllers.Account.signOut(this.dialog);
      }
      password(user) {
        return this.open('PasswordDialog', {
          user,
          own: user.ID === this.model.user.ID,
          heading: this.model.t('changePassword') + ' · ' + user.displayName,
          current: '',
          password: '',
          confirmation: ''
        });
      }
      onPassword() {
        const user = this.vm.getProperty('/user');
        this.dialog.close();
        this.app.dialogs.password(user);
      }
      onSavePassword() {
        return this.app.controllers.Account.changePassword({
          password: this.byId('password'),
          confirmation: this.byId('confirmation'),
          current: this.byId('current'),
          user: this.vm.getProperty('/user'),
          own: this.vm.getProperty('/own'),
          dialog: this.dialog
        });
      }
      displayLink(url) {
        return this.open('DisplayLinkDialog', { url });
      }
      onCopyLink() {
        this.app.run(async () => {
          await navigator.clipboard.writeText(this.vm.getProperty('/url'));
          MessageToast.show(this.model.t('copied'));
        });
      }
    };
  }
);
