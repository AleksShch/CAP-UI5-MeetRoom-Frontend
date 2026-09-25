sap.ui.define(
  [
    'sap/ui/core/mvc/Controller',
    'sap/ui/core/mvc/XMLView',
    'sap/ui/model/json/JSONModel',
    'sap/ui/model/resource/ResourceModel',
    'rsvroom/model/AppModel',
    'rsvroom/model/Time',
    'rsvroom/model/i18n',
    'rsvroom/controller/Reservations',
    'rsvroom/controller/Planning',
    'rsvroom/controller/Admin',
    'rsvroom/controller/FloorEditor',
    'rsvroom/controller/Display',
    'rsvroom/controller/Account',
    'rsvroom/controller/Dialogs',
    'sap/m/MessageBox'
  ],
  function (
    Controller,
    XMLView,
    JSONModel,
    ResourceModel,
    AppModel,
    Time,
    I18n,
    Reservations,
    Planning,
    Admin,
    FloorEditor,
    Display,
    Account,
    Dialogs,
    MessageBox
  ) {
    'use strict';
    const pages = {
      dashboard: 'Dashboard',
      bookings: 'Bookings',
      schedule: 'Schedule',
      team: 'Team',
      users: 'Users',
      admin: 'Admin',
      planEditor: 'FloorEditor',
      display: 'Display'
    };
    const icons = {
      dashboard: 'home',
      spaces: 'map',
      rooms: 'meeting-room',
      parking: 'car-rental',
      bookings: 'appointment-2',
      schedule: 'calendar',
      team: 'group',
      users: 'employee',
      admin: 'action-settings',
      planEditor: 'edit'
    };
    return Controller.extend('rsvroom.controller.App', {
      onInit: function () {
        this.getOwnerComponent().app = this;
        this.model = new AppModel();
        this.controls = {};
        this.runtime = {};
        this.pages = new Map();
        this.pageSequence = 0;
        this.renderVersion = 0;
        this.controllers = {
          Reservations: new Reservations(this),
          Planning: new Planning(this),
          Admin: new Admin(this),
          FloorEditor: new FloorEditor(this),
          Display: new Display(this),
          Account: new Account(this)
        };
        this.dialogs = new Dialogs(this);
        this.shellModel = new JSONModel({
          ready: false,
          language: this.model.language,
          sites: [],
          navigation: [],
          display: false,
          error: false,
          denied: false,
          disconnected: false
        });
        this.getView().setModel(this.shellModel, 'shell');
        this.shellModel.setSizeLimit(10000);
        this.updateLanguage();
        this.router = this.getOwnerComponent().getRouter();
        this.router.attachRouteMatched(this._routeMatched, this);
        this.router.attachBypassed(this._routeBypassed, this);
        this.router.parse(this.router.getHashChanger().getHash());
        this.onRetry();
        this.runtime.timer = setInterval(() => {
          if (
            this.model.ready &&
            !this.controls.dialog &&
            this.model.route !== 'planEditor' &&
            !(this.model.route === 'schedule' && this.model.weekDirty)
          )
            this._load()
              .then(loaded => {
                if (loaded) {
                  this.refresh();
                  if (this.model.isDisplay()) this.controllers.Display.heartbeat();
                }
              })
              .catch(e => {
                if (e.status === 401 || e.status === 403) this.controllers.Account.showLogin();
                else {
                  this.model.disconnected = true;
                  this.refresh();
                }
              });
        }, 30000);
      },
      updateLanguage: function () {
        const old = this.resourceModel;
        this.resourceModel = new ResourceModel({ bundle: I18n.bundle(this.model.language) });
        this.getOwnerComponent().setModel(this.resourceModel, 'i18n');
        old?.destroy();
      },
      onLanguage: function (e) {
        this.model.language = e.getSource().getSelectedKey();
        I18n.setLanguage(this.model.language);
        this.updateLanguage();
        this.refresh();
      },
      onOffice: function (e) {
        const id = e.getSource().getSelectedKey();
        this.controllers.FloorEditor.discardPlan(() => {
          this.model.siteID = id;
          this.model.storage.set('rsvroom.site', id);
          this.model.selectedID = null;
          this.model._ensureLocation();
          if (this.model.route === 'planEditor') this.controllers.FloorEditor.openFloorEditor();
          else this.refresh();
        });
      },
      onNavigate: function (e) {
        const key = e.getSource().getBindingContext('shell').getProperty('key');
        if (key === 'planEditor') this.controllers.FloorEditor.openFloorEditor();
        else this.nav(key);
      },
      onProfile: function () {
        this.controllers.Account.chooseProfile();
      },
      onDashboard: function () {
        this.nav('dashboard');
      },
      _routeBypassed: function () {
        this.nav('dashboard');
      },
      nav: function (name, args = {}) {
        this.controllers.FloorEditor.discardPlan(() => this.router.navTo(name, args));
      },
      _routeMatched: function (e) {
        this.model.selectedAreaID = null;
        this.model.route = e.getParameter('name') === 'home' ? 'dashboard' : e.getParameter('name');
        this.model.routeArgs = e.getParameter('arguments') || {};
        if (this.model.ready) {
          this._applyRoute();
          this.refresh();
          if (this.model.isDisplay()) this.controllers.Display.heartbeat();
        }
      },
      _applyRoute: function () {
        const args = this.model.routeArgs || {};
        if (this.model.route === 'planEditor') {
          const id = args.id || this.model.filters.floor || this.model.planEditorLocations()[0]?.ID;
          if (id !== this.model.planFloorID) {
            this.model.planObjectID = null;
            this.model.planDraft = null;
            this.model.planDirty = false;
          }
          this.model.planFloorID = id;
        }
        if (this.model.route === 'office') this.model.siteID = args.id;
        if (this.model.route === 'parkingLot') {
          const lot = this.model.maps.Buildings[args.id];
          if (lot?.kind === 'PARKING') {
            this.model.siteID = lot.site_ID;
            this.model.filters.building = lot.ID;
          }
        }
        if (this.model.route === 'floor' || this.model.route === 'planEditor') {
          const floor =
            this.model.maps.Floors[
              this.model.route === 'planEditor' ? this.model.planFloorID : args.id
            ];
          if (floor) {
            this.model.filters.floor = floor.ID;
            this.model.filters.building = floor.building_ID;
            this.model.siteID = this.model.maps.Buildings[floor.building_ID]?.site_ID;
          } else if (this.model.route === 'planEditor') {
            const lot = this.model.maps.Buildings[this.model.planFloorID];
            if (lot?.kind === 'PARKING') {
              this.model.siteID = lot.site_ID;
              this.model.filters.building = lot.ID;
              this.model.filters.floor =
                this.model.data.Floors.find(row => row.building_ID === lot.ID)?.ID || '';
            }
          }
        }
        if (['desk', 'room', 'parkingSpace', 'display'].includes(this.model.route)) {
          const resource = this.model.maps.Resources[args.id];
          if (resource) {
            this.model.selectedID = resource.ID;
            const place = this.model.place(resource);
            this.model.siteID = place.site?.ID;
            this.model.filters.floor = resource.floor_ID;
            this.model.filters.building = place.building?.ID;
          }
        }
        this.model._ensureLocation();
      },
      _load: function () {
        return this.model.load();
      },
      onRetry: async function () {
        this.shellModel.setProperty('/error', false);
        try {
          if (await this._load()) {
            this._applyRoute();
            await this.refresh();
            if (this.model.isDisplay()) this.controllers.Display.heartbeat();
          }
        } catch (e) {
          if (e.status === 401) await this.controllers.Account.showLogin();
          else {
            this.shellModel.setProperty('/error', true);
            console.error(e);
          }
        }
      },
      refresh: async function () {
        if (this.exiting) return;
        if (this.pageEpoch !== this.model.authEpoch) {
          this.pageEpoch = this.model.authEpoch;
          this.resetPages();
        }
        const version = ++this.renderVersion,
          m = this.model,
          display = m.isDisplay(),
          denied = !!(
            m.ready &&
            ((['admin', 'planEditor'].includes(m.route) && !m.isAdmin()) ||
              (m.route === 'users' && !m.isKeyUser()))
          );
        const builtAt = window.RSVROOM_CONFIG?.builtAt,
          build = builtAt
            ? new Date(builtAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
            : '';
        this.shellModel.setData({
          ready: m.ready,
          language: m.language,
          display,
          denied,
          error: false,
          disconnected: !!m.disconnected,
          sites: m.ready ? m.companyRows('Sites') : [],
          siteID: m.siteID || '',
          company: m.maps.Companies?.[m.companyID]?.name || m.t('workspace'),
          domain:
            m.data.CompanyDomains?.find(r => r.company_ID === m.companyID && r.primary && r.active)
              ?.domain || m.t('appName'),
          date: m.ready
            ? Time.pretty(Time.date(new Date(), m.zone()), m.language, {
                day: 'numeric',
                month: 'short'
              })
            : '',
          role: m.user ? m.t('role_' + m.user.role) : '',
          user: m.user?.displayName || '',
          version: build,
          versionTooltip: m.t('buildVersion', [build]),
          navigation: m.ready
            ? [
                'dashboard',
                'spaces',
                'rooms',
                'parking',
                'bookings',
                'schedule',
                'team',
                ...(m.isKeyUser() ? ['users'] : []),
                ...(m.isAdmin() ? ['admin', 'planEditor'] : [])
              ].map(key => ({
                key,
                label: m.t(key),
                icon: 'sap-icon://' + icons[key],
                selected:
                  m.route === key ||
                  (key === 'parking' && !!m.isParking()) ||
                  (key === 'spaces' &&
                    ['desk', 'office', 'floor'].includes(m.route) &&
                    !m.isParking()) ||
                  (key === 'rooms' && m.route === 'room')
              }))
            : []
        });
        this.byId('root').toggleStyleClass('displayMode', display);
        if (denied) return;
        const name = m.ready ? pages[m.route] || 'Reservations' : 'Login';
        if (!this.pages.has(name)) {
          const pending = this.getOwnerComponent().runAsOwner(() =>
            XMLView.create({
              id: this.getView().createId(name + ++this.pageSequence),
              viewName: 'rsvroom.view.' + name
            })
          );
          this.pages.set(name, pending);
          pending.catch(() => {
            if (this.pages.get(name) === pending) this.pages.delete(name);
          });
        }
        try {
          const view = await this.pages.get(name);
          if (this.exiting) {
            view.destroy();
            return;
          }
          if (version !== this.renderVersion) return;
          if (!view.getParent()) this.byId('pages').addItem(view);
          for (const child of this.byId('pages').getItems()) child.setVisible(child === view);
          view.getController().refresh();
        } catch (error) {
          if (version === this.renderVersion) {
            this.shellModel.setProperty('/error', true);
            console.error(error);
          }
        }
      },
      reload: async function () {
        if (await this._load()) await this.refresh();
      },
      resetPages: function () {
        this.byId('pages').removeAllItems();
        for (const pending of this.pages.values())
          pending.then(view => view.destroy()).catch(() => {});
        this.pages.clear();
        this.controls.planCanvas = null;
        this.controls.planGeometryFields = null;
        this.controls.planObjectSelector = null;
        this.controls.planConfigureButton = null;
      },
      run: async function (action) {
        try {
          return await action();
        } catch (e) {
          if (e.status === 401) await this.controllers.Account.showLogin();
          else if (e.status === 403 || e.status === 409) {
            await this._load().catch(() => {});
            this.refresh();
          }
          MessageBox.error(
            e.code === 'BOOKING_CONFLICT'
              ? this.model.t('conflict')
              : e.name === 'TimeoutError' || /fetch failed|failed to fetch/i.test(e.message)
                ? this.model.t('networkError')
                : this.model.t(e.message)
          );
          return null;
        }
      },
      onExit: function () {
        this.exiting = true;
        this.renderVersion++;
        clearInterval(this.runtime.timer);
        this.model.authEpoch = (this.model.authEpoch || 0) + 1;
        this.dialogs.sequence++;
        this.router.detachRouteMatched(this._routeMatched, this);
        this.router.detachBypassed(this._routeBypassed, this);
        this.controls.dialog?.destroy();
        for (const pending of this.pages.values())
          pending.then(view => view.destroy()).catch(() => {});
        this.shellModel.destroy();
      }
    });
  }
);
