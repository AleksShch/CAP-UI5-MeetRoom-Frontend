const cds = require('@sap/cds');
const { domainToASCII } = require('node:url');
const imageSize = require('./PlanImage');
const nextAreaName = require('./AreaName');
const { SELECT } = cds.ql;
const parents = {
  CompanyDomains: ['company', 'Companies'],
  Sites: ['company', 'Companies'],
  Buildings: ['site', 'Sites'],
  Floors: ['building', 'Buildings'],
  FloorObjects: ['floor', 'Floors'],
  Resources: ['floor', 'Floors'],
  Users: ['company', 'Companies'],
  Teams: ['company', 'Companies'],
  Equipment: ['company', 'Companies']
};

// All queries use the caller's CAP transaction, including atomic batches.
module.exports = new (class BookingModel {
  async prepareCreate(req) {
    if (
      req.event !== 'CREATE' ||
      req.target?.name.split('.').pop() !== 'FloorObjects' ||
      !(req.data.name == null || (typeof req.data.name === 'string' && !req.data.name.trim()))
    )
      return;
    const tx = cds.tx(req);
    const floor =
      req.data.floor_ID &&
      (await tx.run(
        SELECT.one
          .from('rsvroom.Floors')
          .columns('name', 'building_ID')
          .where({ ID: req.data.floor_ID })
      ));
    if (!floor) return;
    const building = await tx.run(
      SELECT.one.from('rsvroom.Buildings').columns('name').where({ ID: floor.building_ID })
    );
    const areas = await tx.run(
      SELECT.from('rsvroom.FloorObjects').columns('name').where({ floor_ID: req.data.floor_ID })
    );
    req.data.name = nextAreaName(building?.name, floor.name, areas);
  }

  async validateWrite(req) {
    const name = req.target.name.split('.').pop();
    const tx = cds.tx(req);
    // Changes through navigation properties must use the same entity handlers.
    for (const [key, value] of Object.entries(req.data)) {
      if (req.target.elements[key]?.isAssociation && value !== undefined) {
        req.reject(400, 'DEEP_WRITE_UNSUPPORTED', key, [key]);
      }
    }

    const previous =
      req.event === 'UPDATE' ? await tx.run(SELECT.one.from(req.subject)) : undefined;
    if (req.event === 'UPDATE' && !previous) req.reject(404, 'ENTRY_NOT_FOUND', [name]);
    const data = { ...previous, ...req.data };
    const cache = new Map();
    const get = async (entity, id, field) => {
      if (!id) req.reject(400, 'FIELD_REQUIRED', field, [field]);
      const key = `${entity}:${id}`;
      if (!cache.has(key)) {
        const row = await tx.run(SELECT.one.from(`rsvroom.${entity}`).where({ ID: id }));
        if (!row) req.reject(400, 'REFERENCE_MISSING', field, [field, entity]);
        cache.set(key, row);
      }
      return cache.get(key);
    };
    const ancestry = async (entity, row, requireActive = false) => {
      if (requireActive && row.active === false) req.reject(409, 'ENTRY_INACTIVE', [entity]);
      if (entity === 'Companies') return row.ID;
      const [field, parent] = parents[entity];
      return ancestry(parent, await get(parent, row[`${field}_ID`], `${field}_ID`), requireActive);
    };
    const sameCompany = (a, b) => {
      if (a !== b) req.reject(400, 'COMPANY_MISMATCH');
    };
    const set = (key, value) => {
      data[key] = req.data[key] = value;
    };

    if (parents[name]) {
      const [field, parent] = parents[name];
      const key = `${field}_ID`;
      await get(parent, data[key], key);
      // Moving an existing branch would silently move all of its bookings/users.
      if (previous && previous[key] !== data[key]) {
        req.reject(409, 'PARENT_IMMUTABLE', key, [key]);
      }
    }

    if (name === 'CompanyDomains') {
      const domain = domainToASCII(
        String(data.domain || '')
          .trim()
          .toLowerCase()
      );
      if (
        domain.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
          domain
        )
      ) {
        req.reject(400, 'DOMAIN_INVALID', 'domain');
      }
      set('domain', domain);
      if (data.primary && data.active !== false) {
        const query = SELECT.one
          .from('rsvroom.CompanyDomains')
          .where({ company_ID: data.company_ID, primary: true, active: true });
        if (data.ID) query.and({ ID: { '!=': data.ID } });
        if (await tx.run(query)) req.reject(409, 'PRIMARY_DOMAIN_EXISTS', 'primary');
      }
    }

    if (name === 'Sites') {
      try {
        new Intl.DateTimeFormat('en', { timeZone: data.timeZone });
      } catch {
        req.reject(400, 'TIME_ZONE_INVALID', 'timeZone');
      }
      if (!data.timeZone) req.reject(400, 'TIME_ZONE_REQUIRED', 'timeZone');
      if (data.locale) {
        try {
          set('locale', Intl.getCanonicalLocales(data.locale)[0]);
        } catch {
          req.reject(400, 'LOCALE_INVALID', 'locale');
        }
      }
      if (data.countryCode) set('countryCode', data.countryCode.toUpperCase());
      if (!/^[A-Z]{2}$/.test(data.countryCode || ''))
        req.reject(400, 'COUNTRY_INVALID', 'countryCode');
    }

    if (name === 'Users') {
      const email = String(data.email || '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) req.reject(400, 'EMAIL_INVALID', 'email');
      set('email', email);
      const duplicate = SELECT.one.from('rsvroom.Users').columns('ID').where({ email });
      if (data.ID) duplicate.and({ ID: { '!=': data.ID } });
      if (await tx.run(duplicate)) req.reject(409, 'EMAIL_EXISTS', 'email');
      if (data.defaultSite_ID)
        sameCompany(
          data.company_ID,
          (await get('Sites', data.defaultSite_ID, 'defaultSite_ID')).company_ID
        );
    }

    if (name === 'Buildings' && previous && data.kind !== previous.kind)
      req.reject(409, 'BUILDING_KIND_IMMUTABLE', 'kind');

    if (name === 'Floors') {
      if (data.planImage) {
        let size;
        try {
          size = imageSize(data.planImage);
        } catch (error) {
          req.reject(
            400,
            error.message === 'PLAN_IMAGE_DIMENSIONS' ? error.message : 'PLAN_IMAGE_INVALID',
            'planImage'
          );
        }
        set('planWidth', size.width);
        set('planHeight', size.height);
      }
      if (
        previous &&
        (data.planWidth !== previous.planWidth || data.planHeight !== previous.planHeight)
      ) {
        const objects = await tx.run(
          SELECT.from('rsvroom.FloorObjects').where({ floor_ID: previous.ID })
        );
        if (
          objects.some(
            object =>
              Number(object.x) + Number(object.width) > data.planWidth ||
              Number(object.y) + Number(object.height) > data.planHeight
          )
        )
          req.reject(409, 'PLAN_RESIZE_CONFLICT');
      }
    }

    if (name === 'FloorObjects') {
      // CAP applies database defaults after before-handlers; validate those values too.
      for (const [key, element] of Object.entries(req.target.elements)) {
        if (data[key] === undefined && element.default?.val !== undefined)
          set(key, element.default.val);
      }
      const floor = await get('Floors', data.floor_ID, 'floor_ID');
      const [x, y, width, height, radius, opacity] = [
        'x',
        'y',
        'width',
        'height',
        'radius',
        'opacity'
      ].map(key => Number(data[key]));
      if (
        ![x, y, width, height, radius, opacity].every(Number.isFinite) ||
        x < 0 ||
        y < 0 ||
        width < 1 ||
        height < 1 ||
        x + width > floor.planWidth ||
        y + height > floor.planHeight ||
        radius < 0 ||
        radius > Math.min(width, height) / 2 ||
        opacity < 0 ||
        opacity > 1
      )
        req.reject(400, 'PLAN_OBJECT_BOUNDS');
      if (!/^#[0-9a-f]{6}$/i.test(data.color || '')) req.reject(400, 'PLAN_OBJECT_COLOR', 'color');
      if (data.resource_ID) {
        const resource = await get('Resources', data.resource_ID, 'resource_ID');
        if (resource.floor_ID !== data.floor_ID)
          req.reject(400, 'PLAN_OBJECT_FLOOR', 'resource_ID');
        if (
          (data.type === 'ROOM' && resource.type !== 'ROOM') ||
          (['DESK', 'ZONE'].includes(data.type) && resource.type !== 'WORKPLACE') ||
          (data.type === 'PARKING' && resource.type !== 'PARKING')
        )
          req.reject(400, 'PLAN_OBJECT_TYPE', 'resource_ID');
      }
    }

    if (name === 'Floors' && data.floorPlan) {
      if (
        data.floorPlan.length > 1000000 ||
        !/<svg[\s>]/i.test(data.floorPlan) ||
        /<!DOCTYPE|<!ENTITY|<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)[^"']+/i.test(
          data.floorPlan
        )
      ) {
        req.reject(400, 'SVG_INVALID', 'floorPlan');
      }
    }

    if (name === 'WorkDays') {
      const employee = await get('Users', data.user_ID, 'user_ID');
      if (data.mode === 'OFFICE' && !data.site_ID) req.reject(400, 'OFFICE_REQUIRED', 'site_ID');
      if (data.site_ID)
        sameCompany(employee.company_ID, (await get('Sites', data.site_ID, 'site_ID')).company_ID);
      if (
        !data.date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        !Number.isFinite(Date.parse(data.date)) ||
        new Date(data.date).toISOString().slice(0, 10) !== data.date
      )
        req.reject(400, 'DATE_INVALID', 'date');
      if (!data.startTime || !data.endTime || data.startTime >= data.endTime)
        req.reject(400, 'WORKDAY_INTERVAL_INVALID', 'endTime');
    }

    if (name === 'Resources') {
      if (data.restrictedTeam_ID)
        sameCompany(
          await ancestry('Resources', data),
          (await get('Teams', data.restrictedTeam_ID, 'restrictedTeam_ID')).company_ID
        );
      const floor = await get('Floors', data.floor_ID, 'floor_ID');
      const building = await get('Buildings', floor.building_ID, 'floor_ID');
      if (building.kind === 'PARKING' && data.type !== 'PARKING')
        req.reject(400, 'PARKING_RESOURCE_REQUIRED', 'type');
      if (data.type === 'PARKING' && (data.capacity ?? 1) !== 1)
        req.reject(400, 'PARKING_CAPACITY', 'capacity');
      if (data.mapX > floor.planWidth || data.mapY > floor.planHeight)
        req.reject(400, 'COORDINATES_INVALID');
      if (data.type === 'ROOM' && (!Number.isInteger(data.capacity) || data.capacity < 1)) {
        req.reject(400, 'CAPACITY_INVALID', 'capacity');
      }
      if (previous && previous.type !== data.type)
        req.reject(409, 'RESOURCE_TYPE_IMMUTABLE', 'type');
      if (previous && data.capacity < previous.capacity) {
        const tooLarge = await tx.run(
          SELECT.one.from('rsvroom.Bookings').where({
            resource_ID: data.ID,
            status: 'CONFIRMED',
            attendeeCount: { '>': data.capacity },
            endAt: { '>': new Date().toISOString() }
          })
        );
        if (tooLarge) req.reject(409, 'CAPACITY_BOOKING_CONFLICT', 'capacity');
      }
    }

    if (name === 'TeamMembers') {
      const team = await get('Teams', data.team_ID, 'team_ID');
      const user = await get('Users', data.user_ID, 'user_ID');
      sameCompany(team.company_ID, user.company_ID);
    }

    if (name === 'OpeningHours' || name === 'WorkSchedules') {
      const site = await get('Sites', data.site_ID, 'site_ID');
      const start = name === 'OpeningHours' ? 'opensAt' : 'startTime';
      const end = name === 'OpeningHours' ? 'closesAt' : 'endTime';
      if (!data[start] || !data[end] || data[start] >= data[end]) {
        req.reject(400, 'SCHEDULE_INTERVAL_INVALID', end);
      }
      if (name === 'WorkSchedules') {
        const user = await get('Users', data.user_ID, 'user_ID');
        sameCompany(site.company_ID, user.company_ID);
      }
    }

    if (name === 'Displays' || name === 'ResourceEquipment') {
      const resource = await get('Resources', data.resource_ID, 'resource_ID');
      if (name === 'ResourceEquipment') {
        const equipment = await get('Equipment', data.equipment_ID, 'equipment_ID');
        sameCompany(await ancestry('Resources', resource), equipment.company_ID);
      }
    }

    if (name === 'Bookings') {
      // CAP 9 normalizes Timestamp values before service handlers. Its body
      // parser retains the original JSON in _raw for normal and batch requests;
      // inspect it to avoid interpreting a missing offset in the server's zone.
      // Regression tests cover this small adapter compatibility dependency.
      const original = typeof req.req?._raw === 'string' ? JSON.parse(req.req._raw) : req.data;
      const property = decodeURIComponent(req.req?.path?.split('/').pop() || '');
      for (const field of ['startAt', 'endAt']) {
        const value = Object.hasOwn(original, field)
          ? original[field]
          : property === field && Object.hasOwn(original, 'value')
            ? original.value
            : data[field];
        if (
          typeof value !== 'string' ||
          !/(Z|[+-]\d{2}:\d{2})$/i.test(value) ||
          !Number.isFinite(Date.parse(value))
        ) {
          req.reject(400, 'TIMESTAMP_INVALID', field);
        }
        set(field, new Date(value).toISOString());
      }
      if (data.startAt >= data.endAt) req.reject(400, 'BOOKING_INTERVAL_INVALID', 'endAt');
      const resource = await get('Resources', data.resource_ID, 'resource_ID');
      const user = await get('Users', data.user_ID, 'user_ID');
      const confirmed = (data.status || 'CONFIRMED') === 'CONFIRMED';
      sameCompany(
        await ancestry('Resources', resource, confirmed),
        await ancestry('Users', user, confirmed)
      );
      if (
        confirmed &&
        resource.restrictedTeam_ID &&
        !(await tx.run(
          SELECT.one
            .from('rsvroom.TeamMembers')
            .where({ team_ID: resource.restrictedTeam_ID, user_ID: user.ID })
        ))
      )
        req.reject(403, 'TEAM_RESTRICTED');
      const attendees = data.attendeeCount ?? 1;
      if (!Number.isInteger(attendees) || attendees < 1)
        req.reject(400, 'ATTENDEES_INVALID', 'attendeeCount');
      const capacity = resource.type === 'ROOM' ? resource.capacity : 1;
      if (confirmed && attendees > capacity)
        req.reject(400, 'CAPACITY_EXCEEDED', 'attendeeCount', [capacity]);
      if (confirmed) {
        // One SQLite connection serializes transactions; handle() also
        // serializes the writes inside a single batch transaction.
        const query = SELECT.one.from('rsvroom.Bookings').where({
          resource_ID: data.resource_ID,
          status: 'CONFIRMED',
          startAt: { '<': data.endAt },
          endAt: { '>': data.startAt }
        });
        if (data.ID) query.and({ ID: { '!=': data.ID } });
        if (await tx.run(query))
          req.reject({ status: 409, code: 'BOOKING_CONFLICT', message: 'BOOKING_CONFLICT' });
      }
    }

    // Check declared business keys in the same transaction to return a useful
    // conflict response instead of leaking a SQLite constraint error.
    for (const [annotation, columns] of Object.entries(req.target)) {
      if (!annotation.startsWith('@assert.unique.')) continue;
      const keys = columns.map(column => {
        const field = column['='];
        return req.target.elements[field]?.isAssociation ? `${field}_ID` : field;
      });
      if (keys.some(key => data[key] == null)) continue;
      const query = SELECT.one
        .from(req.target)
        .where(Object.fromEntries(keys.map(key => [key, data[key]])));
      if (data.ID) query.and({ ID: { '!=': data.ID } });
      if (await tx.run(query)) req.reject(409, 'DUPLICATE_ENTRY', [keys.join(', ')]);
    }
  }

  async validateDelete(req) {
    const row = await cds.tx(req).run(SELECT.one.from(req.subject));
    if (!row) return;
    const target = req.target.query?.SELECT?.from?.ref?.[0];
    if (!target) return;
    // Retain referenced master data and booking history; deactivate instead.
    for (const entity of Object.values(cds.entities('rsvroom'))) {
      if (entity.kind !== 'entity') continue;
      for (const element of Object.values(entity.elements)) {
        if (!element.isAssociation || element.on || element.target !== target) continue;
        const reference = await cds.tx(req).run(
          SELECT.one
            .from(entity)
            .columns('ID')
            .where({ [`${element.name}_ID`]: row.ID })
        );
        if (reference) req.reject(409, 'ENTRY_REFERENCED', [entity.name.split('.').pop()]);
      }
    }
  }
})();
