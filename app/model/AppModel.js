sap.ui.define(
  [
    'rsvroom/model/Time',
    'rsvroom/model/i18n',
    'rsvroom/service/Api',
    'rsvroom/model/DisplaySnapshot',
    'rsvroom/model/BookingModel',
    'rsvroom/model/WorkWeekModel'
  ],
  function (Time, I18n, Api, DisplaySnapshot, BookingModel, WorkWeekModel) {
    'use strict';
    const entities = [
      'Companies',
      'CompanyDomains',
      'Sites',
      'Buildings',
      'Floors',
      'FloorObjects',
      'Resources',
      'Users',
      'Teams',
      'TeamMembers',
      'Bookings',
      'WorkDays',
      'Equipment',
      'ResourceEquipment',
      'Displays',
      'OpeningHours',
      'WorkSchedules'
    ];
    const sources = {
      ParkingLots: 'Buildings',
      ParkingLevels: 'Floors',
      ParkingSpaces: 'Resources'
    };
    return class AppModel {
      constructor() {
        this.api = Api;
        this.bookings = new BookingModel(this);
        this.workWeek = new WorkWeekModel(this);
        this.storage = {
          get: key => {
            try {
              return localStorage.getItem(key);
            } catch {
              return null;
            }
          },
          set: (key, value) => {
            try {
              localStorage.setItem(key, value);
            } catch {}
          }
        };
        this.language = I18n.language();
        this.userID = null;
        this.siteID = this.storage.get('rsvroom.site');
        this.filters = {
          date: Time.date(),
          start: '08:00',
          end: '17:00',
          building: '',
          floor: '',
          capacity: 1,
          equipment: [],
          mode: innerWidth < 700 ? 'list' : 'plan'
        };
        this.route = 'dashboard';
        this.data = {};
        this.maps = {};
        this.ready = false;
      }
      async load() {
        const epoch = this.authEpoch;
        const authStatus = await this.api.auth('status');
        const query = this.routeArgs?.['?query'] || {};
        let rows, sessionUser;
        if (this.isDisplay() && query.device && query.token) {
          const snapshot = DisplaySnapshot(
            await this.api.action('displaySnapshot', { deviceID: query.device, token: query.token })
          );
          rows = entities.map(entity => snapshot[entity] || []);
        } else {
          sessionUser = await this.api.request('currentUser()');
          rows = await Promise.all(entities.map(entity => this.api.list(entity)));
        }
        if (epoch !== this.authEpoch) return false;
        this.authStatus = authStatus;
        entities.forEach((entity, index) => {
          this.data[entity] = rows[index];
          this.maps[entity] = Object.fromEntries(rows[index].map(row => [row.ID, row]));
        });
        this.user = sessionUser;
        this.userID = sessionUser?.ID;
        this.companyID = this.user?.company_ID || this.data.Companies[0]?.ID;
        if (!this.ready) {
          this.siteID = this.siteID || this.user?.defaultSite_ID;
          this.filters.date = Time.date(new Date(), this.currentSite()?.timeZone || 'UTC');
        }
        this.ready = true;
        this.disconnected = false;
        this._ensureLocation();
        return true;
      }
      t(key, args) {
        return I18n.text(this.language, key, args);
      }

      isDisplay() {
        return this.route === 'display';
      }

      isParking() {
        return (
          ['parking', 'parkingLot', 'parkingSpace'].includes(this.route) ||
          (this.route === 'desk' && this.maps.Resources[this.routeArgs?.id]?.type === 'PARKING') ||
          (this.route === 'floor' && this.isParkingFloor(this.maps.Floors[this.routeArgs?.id]))
        );
      }

      isParkingFloor(floor) {
        return this.maps.Buildings[floor?.building_ID]?.kind === 'PARKING';
      }

      resourceRoute(resource) {
        return resource?.type === 'PARKING'
          ? 'parkingSpace'
          : resource?.type === 'ROOM'
            ? 'room'
            : 'desk';
      }

      resourceSection(resource) {
        return resource?.type === 'PARKING'
          ? 'parking'
          : resource?.type === 'ROOM'
            ? 'rooms'
            : 'spaces';
      }

      resourceObjectType(resource) {
        return resource.type === 'ROOM'
          ? 'ROOM'
          : resource.type === 'WORKPLACE'
            ? 'DESK'
            : resource.type === 'PARKING'
              ? 'PARKING'
              : 'OTHER';
      }

      bookingBuildings() {
        // Older parking resources on office floors remain reachable in Parking.
        const legacy = new Set(
          this.data.Resources.filter(row => row.type === 'PARKING').map(
            row => this.maps.Floors[row.floor_ID]?.building_ID
          )
        );
        return this.data.Buildings.filter(
          row =>
            row.site_ID === this.siteID &&
            (this.isParking()
              ? row.kind === 'PARKING' || legacy.has(row.ID)
              : row.kind !== 'PARKING')
        );
      }

      bookingFloors() {
        return this.data.Floors.filter(
          row =>
            row.building_ID === this.filters.building &&
            (!this.isParking() ||
              this.isParkingFloor(row) ||
              this.data.Resources.some(
                resource => resource.floor_ID === row.ID && resource.type === 'PARKING'
              ))
        );
      }

      _ensureLocation() {
        const sites = this.companyRows('Sites');
        if (!sites.some(site => site.ID === this.siteID) && !this.isDisplay())
          this.siteID = sites.find(site => site.active)?.ID || sites[0]?.ID;
        const buildings = [
          'spaces',
          'rooms',
          'office',
          'floor',
          'desk',
          'room',
          'parking',
          'parkingLot',
          'parkingSpace'
        ].includes(this.route)
          ? this.bookingBuildings()
          : this.data.Buildings.filter(row => row.site_ID === this.siteID);
        if (!buildings.some(row => row.ID === this.filters.building))
          this.filters.building = buildings[0]?.ID || '';
        const floors = this.bookingFloors();
        if (!floors.some(row => row.ID === this.filters.floor))
          this.filters.floor = floors[0]?.ID || '';
      }

      companyRows(entity) {
        return (this.data[entity] || []).filter(row => row.company_ID === this.companyID);
      }

      currentSite() {
        return this.maps.Sites?.[this.siteID];
      }

      place(resource) {
        const floor = this.maps.Floors[resource.floor_ID],
          building = this.maps.Buildings[floor?.building_ID],
          site = this.maps.Sites[building?.site_ID],
          company = this.maps.Companies[site?.company_ID];
        return { floor, building, site, company };
      }

      zone(resource) {
        return (resource ? this.place(resource).site : this.currentSite())?.timeZone || 'UTC';
      }

      interval(resource) {
        return Time.interval(
          this.filters.date,
          this.filters.start,
          this.filters.end,
          this.zone(resource)
        );
      }

      equipmentFor(resource) {
        return this.data.ResourceEquipment.filter(row => row.resource_ID === resource.ID)
          .map(row => this.maps.Equipment[row.equipment_ID])
          .filter(Boolean);
      }

      resourceState(resource) {
        const place = this.place(resource),
          membership = this.data.TeamMembers.filter(row => row.user_ID === this.user?.ID).map(
            row => row.team_ID
          );
        let availability = 'available',
          overlaps = [];
        if (
          !resource.active ||
          !place.floor?.active ||
          !place.building?.active ||
          !place.site?.active ||
          !place.company?.active
        )
          availability = 'unavailable';
        else if (
          place.site.company_ID !== this.companyID ||
          (resource.restrictedTeam_ID && !membership.includes(resource.restrictedTeam_ID))
        )
          availability = 'restricted';
        else {
          try {
            overlaps = this.data.Bookings.filter(
              row => row.resource_ID === resource.ID && Time.overlaps(row, this.interval(resource))
            );
          } catch {
            availability = 'unavailable';
          }
          if (overlaps.length)
            availability = overlaps.some(row => row.user_ID === this.user?.ID)
              ? 'mine'
              : 'reserved';
        }
        const peers = this.data.TeamMembers.filter(
          row => membership.includes(row.team_ID) && row.user_ID !== this.user?.ID
        ).map(row => row.user_ID);
        return {
          ...resource,
          availability,
          statusText: this.t(availability),
          teamLabel: overlaps.some(row => peers.includes(row.user_ID)),
          overlaps
        };
      }

      teamPeople(teamID) {
        const ids = teamID
          ? [teamID]
          : this.data.TeamMembers.filter(row => row.user_ID === this.user?.ID).map(
              row => row.team_ID
            );
        return this.data.Users.filter(
          user =>
            user.company_ID === this.companyID &&
            this.data.TeamMembers.some(row => row.user_ID === user.ID && ids.includes(row.team_ID))
        );
      }

      adminTarget(entity) {
        return sources[entity] || entity;
      }

      adminRows(entity) {
        const rows = this.data[this.adminTarget(entity)] || [];
        if (entity === 'ParkingLots') return rows.filter(row => row.kind === 'PARKING');
        if (entity === 'Buildings') return rows.filter(row => row.kind !== 'PARKING');
        if (entity === 'ParkingLevels')
          return rows.filter(
            row =>
              this.isParkingFloor(row) ||
              this.data.Resources.some(
                resource => resource.floor_ID === row.ID && resource.type === 'PARKING'
              )
          );
        if (entity === 'Floors') return rows.filter(row => !this.isParkingFloor(row));
        if (entity === 'ParkingSpaces') return rows.filter(row => row.type === 'PARKING');
        if (entity === 'Resources') return rows.filter(row => row.type !== 'PARKING');
        return rows;
      }

      planEditorLocations() {
        const buildings = this.data.Buildings.filter(row => row.site_ID === this.siteID);
        const ids = new Set(buildings.map(row => row.ID));
        const floors = this.data.Floors.filter(row => ids.has(row.building_ID));
        const locations = floors.map(row => {
          const building = this.maps.Buildings[row.building_ID];
          return {
            ...row,
            name:
              (building.kind === 'PARKING' ? this.t('parking') + ' · ' : '') +
              building.name +
              ' · ' +
              row.name
          };
        });
        // A parking lot must be reachable before its first level has been created.
        return locations.concat(
          buildings
            .filter(
              row => row.kind === 'PARKING' && !floors.some(floor => floor.building_ID === row.ID)
            )
            .map(row => ({ ...row, name: this.t('parking') + ' · ' + row.name }))
        );
      }

      isAdmin() {
        return this.user?.role === 'ADMIN';
      }

      isKeyUser() {
        return this.isAdmin() || this.user?.role === 'KEY_USER';
      }

      canDeleteBooking(booking) {
        return (
          booking.user_ID === this.user?.ID ||
          (this.isKeyUser() &&
            (this.isAdmin() || this.maps.Users[booking.user_ID]?.company_ID === this.companyID))
        );
      }
    };
  }
);
