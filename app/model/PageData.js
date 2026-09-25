sap.ui.define(['rsvroom/model/Time', 'rsvroom/model/AdminSchema'], function (Time, Schema) {
  'use strict';
  const states = {
    available: 'Success',
    mine: 'Information',
    reserved: 'Warning',
    restricted: 'Error',
    CONFIRMED: 'Success',
    CANCELLED: 'None',
    online: 'Success',
    offline: 'Warning'
  };
  const location = (m, r) => {
    const p = m.place(r);
    return [p.site?.city, p.building?.name, p.floor?.name].filter(Boolean).join(' · ');
  };
  const bookingTime = (m, b) => {
    const z = m.zone(m.maps.Resources[b.resource_ID]);
    return `${Time.pretty(Time.date(b.startAt, z), m.language, { day: 'numeric', month: 'short' })} · ${Time.clock(b.startAt, z)}–${Time.clock(b.endAt, z)}`;
  };
  const options = rows =>
    rows.map(r => ({ ...r, name: r.name || r.displayName || r.domain || r.code || r.ID }));
  const booking = (m, b) => {
    const r = m.maps.Resources[b.resource_ID];
    return {
      ...b,
      time: bookingTime(m, b),
      resourceName: r?.name || m.t('resource'),
      location: r ? location(m, r) : '',
      statusText: m.t(b.status),
      state: states[b.status],
      own: b.user_ID === m.user?.ID,
      editable: b.user_ID === m.user?.ID && b.status === 'CONFIRMED',
      deletable: b.user_ID !== m.user?.ID && m.canDeleteBooking(b),
      owner: m.maps.Users[b.user_ID]?.displayName || '',
      sourceText: m.t(b.source || 'RSVROOM'),
      day: Time.pretty(Time.date(b.startAt, m.zone(r)), m.language)
    };
  };
  const person = (m, u, day) => {
    const p = m.data.WorkDays.find(r => r.user_ID === u.ID && r.date === day),
      b = m.data.Bookings.find(
        r =>
          r.user_ID === u.ID &&
          r.status === 'CONFIRMED' &&
          m.maps.Resources[r.resource_ID]?.type === 'WORKPLACE' &&
          Time.date(r.startAt, m.zone(m.maps.Resources[r.resource_ID])) === day
      ),
      r = b && m.maps.Resources[b.resource_ID];
    return {
      ...u,
      avatar: u.displayName
        .split(' ')
        .map(p => p[0])
        .slice(0, 2)
        .join(''),
      modeText: m.t(p?.mode || (b ? 'OFFICE' : 'notPlanned')),
      resourceID: r?.ID || '',
      resourceCode: r?.code || '',
      siteName: m.maps.Sites[p?.site_ID]?.name || '',
      day
    };
  };
  function dashboard(m) {
    const today = Time.date(new Date(), m.zone()),
      resources = m.data.Resources.filter(r => m.place(r).site?.ID === m.siteID).map(r =>
        m.resourceState(r)
      );
    const mine = m.data.Bookings.filter(
      b => b.user_ID === m.user?.ID && b.status === 'CONFIRMED' && Date.parse(b.endAt) > Date.now()
    ).sort((a, b) => a.startAt.localeCompare(b.startAt));
    const desk = mine.find(
      b =>
        m.maps.Resources[b.resource_ID]?.type === 'WORKPLACE' &&
        Time.date(b.startAt, m.zone(m.maps.Resources[b.resource_ID])) === today
    );
    return {
      today: Time.pretty(today, m.language),
      stats: [
        ['availableDesks', 'WORKPLACE', 'spaces'],
        ['availableRooms', 'ROOM', 'rooms'],
        ['availableParking', 'PARKING', 'parking'],
        ['yourReservations', null, 'bookings']
      ].map(([key, type, route]) => ({
        label: m.t(key),
        value: String(
          type
            ? resources.filter(r => r.type === type && r.availability === 'available').length
            : mine.length
        ),
        route,
        button: m.t(route)
      })),
      desk: desk ? booking(m, desk) : null,
      meetings: mine
        .filter(b => m.maps.Resources[b.resource_ID]?.type === 'ROOM')
        .slice(0, 3)
        .map(b => booking(m, b)),
      people: m
        .teamPeople()
        .slice(0, 6)
        .map(u => person(m, u, today))
    };
  }
  function reservations(m) {
    const rooms = ['rooms', 'room'].includes(m.route),
      parking = !!m.isParking(),
      floor = m.maps.Floors[m.filters.floor];
    const resources = m.data.Resources.filter(
      r =>
        r.floor_ID === m.filters.floor &&
        (parking
          ? r.type === 'PARKING'
          : rooms
            ? r.type === 'ROOM'
            : !['ROOM', 'PARKING'].includes(r.type)) &&
        (!rooms || r.capacity >= m.filters.capacity) &&
        m.filters.equipment.every(id =>
          m.data.ResourceEquipment.some(e => e.resource_ID === r.ID && e.equipment_ID === id)
        )
    ).map(r => {
      const resource = m.resourceState(r);
      return {
        ...resource,
        typeText: m.t(r.type),
        state: states[resource.availability] || 'None',
        capacityText: r.type === 'ROOM' ? m.t('fieldValue', [m.t('capacity'), r.capacity]) : '',
        displayURL: `/display/${r.type === 'PARKING' ? 'parking' : r.type === 'ROOM' ? 'room' : 'desk'}/${r.ID}`
      };
    });
    let error = '';
    try {
      m.interval();
    } catch (e) {
      error = m.t(e.message);
    }
    const selected = resources.find(r => r.ID === m.selectedID),
      own = selected?.overlaps.find(b => b.user_ID === m.user?.ID);
    const timeline = [];
    if (selected?.type === 'ROOM')
      for (let hour = 8; hour < 19; hour++) {
        const start = String(hour).padStart(2, '0') + ':00',
          end = String(hour + 1).padStart(2, '0') + ':00';
        let interval;
        try {
          interval = Time.interval(m.filters.date, start, end, m.zone(selected));
        } catch {
          continue;
        }
        const busy = m.data.Bookings.find(
          b => b.resource_ID === selected.ID && Time.overlaps(b, interval)
        );
        timeline.push({
          start,
          end,
          text: start + ' · ' + (busy?.title || m.t('available')),
          enabled: !busy
        });
      }
    return {
      title: m.t(parking ? 'parking' : rooms ? 'rooms' : 'spaces'),
      intro: m.t(parking ? 'parkingIntro' : rooms ? 'roomsIntro' : 'spacesIntro'),
      rooms,
      parking,
      admin: m.isAdmin(),
      noParking: parking && !m.bookingBuildings().length,
      buildingLabel: m.t(parking ? 'parkingLot' : 'building'),
      floorLabel: m.t(parking ? 'parkingLevel' : 'floor'),
      resourceLabel: m.t(parking ? 'parkingSpace' : 'resource'),
      buildings: options(m.bookingBuildings()),
      floors: options(m.bookingFloors()),
      equipment: options(m.companyRows('Equipment')),
      filters: { ...m.filters },
      zone: m.zone(),
      error,
      resources,
      resourceOptions: [
        { ID: '', name: m.t('selectSpace') },
        ...resources.map(r => ({ ID: r.ID, name: r.name + ' · ' + r.statusText }))
      ],
      floor: floor
        ? { ...floor, floorPlan: floor.floorPlan || '', planImage: floor.planImage || '' }
        : null,
      objects: m.data.FloorObjects.filter(r => r.floor_ID === m.filters.floor),
      objectTypes: parking ? ['PARKING'] : rooms ? ['ROOM'] : ['DESK', 'ZONE'],
      viewState: m.viewerViews?.[floor?.ID] || null,
      selectedID: m.selectedID || '',
      selected: selected
        ? {
            ...selected,
            location: location(m, selected),
            state: states[selected.availability] || 'None',
            equipment:
              m
                .equipmentFor(selected)
                .map(e => e.name)
                .join(' · ') || m.t('noEquipment'),
            interval:
              Time.pretty(m.filters.date, m.language) +
              ' · ' +
              m.filters.start +
              '–' +
              m.filters.end,
            canBook: selected.availability === 'available',
            ownBooking: own?.ID || '',
            hasOwn: !!own
          }
        : null,
      timeline,
      legend: ['available', 'reserved', 'mine', 'unavailable', 'restricted'].map(key => ({
        text: m.t(key),
        state: states[key] || 'None'
      }))
    };
  }
  function bookings(m) {
    return {
      keyUser: m.isKeyUser(),
      scope: m.bookingsScope || 'mine',
      items: m.data.Bookings.filter(b =>
        m.isKeyUser() && m.bookingsScope === 'all'
          ? m.canDeleteBooking(b)
          : b.user_ID === m.user?.ID
      )
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .map(b => booking(m, b))
    };
  }
  function team(m) {
    const teams = m.companyRows('Teams');
    if (!teams.some(t => t.ID === m.teamID)) m.teamID = teams[0]?.ID;
    const day = m.teamDate || Time.date(new Date(), m.zone());
    return {
      teams: options(teams),
      teamID: m.teamID || '',
      day,
      people: m.teamPeople(m.teamID).map(u => person(m, u, day))
    };
  }
  function schedule(m) {
    const monday = m.weekStart || Time.monday(Time.date(new Date(), m.zone()));
    m.weekStart = monday;
    return {
      heading:
        Time.pretty(monday, m.language, { day: 'numeric', month: 'short' }) +
        ' – ' +
        Time.pretty(Time.addDays(monday, 4), m.language, { day: 'numeric', month: 'short' }),
      days: m.workWeek.draft(monday).map(r => ({
        ...r,
        weekday: Time.pretty(r.date, m.language, { weekday: 'long' }),
        dateLabel: Time.pretty(r.date, m.language, { day: 'numeric', month: 'short' })
      })),
      sites: options(m.companyRows('Sites').filter(s => s.active)),
      modes: ['', 'OFFICE', 'HOME', 'VACATION', 'BUSINESS_TRIP'].map(ID => ({
        ID,
        name: m.t(ID || 'notPlanned')
      }))
    };
  }
  function users(m) {
    return {
      items: (m.isAdmin() ? m.data.Users : m.companyRows('Users')).map(u => ({
        ...u,
        roleText: m.t('role_' + u.role),
        state: u.active ? 'Success' : 'None',
        statusText: m.t(u.active ? 'available' : 'unavailable')
      }))
    };
  }
  function admin(m) {
    const entity = m.adminEntity || 'Companies';
    m.adminEntity = entity;
    const fields = (Schema.fields[entity] || [])
      .filter(
        f =>
          ![
            'active',
            'mapX',
            'mapY',
            'planWidth',
            'planHeight',
            'monitorCount',
            'roomType',
            'workplaceType',
            'restrictedTeam_ID',
            'defaultSite_ID',
            'locale',
            'address',
            'siteType'
          ].includes(f[0])
      )
      .slice(0, 4);
    const rows = m.adminRows(entity).map(r => ({
      ...r,
      cells: fields.map(([key, , kind]) => {
        let v = r[key];
        if (m.maps[m.adminTarget(kind)]) {
          const related = m.maps[m.adminTarget(kind)][v];
          v = related?.name || related?.displayName || related?.code || '';
        } else if (Array.isArray(kind)) v = m.t(key === 'role' ? 'role_' + v : v);
        else if (kind === 'bool') v = m.t(v ? 'yes' : 'no');
        return { text: v == null ? '' : String(v) };
      }),
      state:
        entity === 'Displays'
          ? r.lastSeen && Date.now() - Date.parse(r.lastSeen) < 90000
            ? 'Success'
            : 'Warning'
          : r.active === false
            ? 'None'
            : 'Success',
      statusText: m.t(
        entity === 'Displays'
          ? r.lastSeen && Date.now() - Date.parse(r.lastSeen) < 90000
            ? 'online'
            : 'offline'
          : r.active === false
            ? 'unavailable'
            : 'available'
      )
    }));
    return {
      entity,
      heading: m.t(Schema.labels[entity]),
      options: Object.entries(Schema.labels).map(([ID, key]) => ({ ID, name: m.t(key) })),
      columns: fields.map(f => ({ text: m.t(f[1]) })),
      rows,
      editable: !!Schema.fields[entity],
      floor: ['Floors', 'ParkingLevels'].includes(entity),
      lot: entity === 'ParkingLots',
      level: entity === 'ParkingLevels',
      password: entity === 'Users' && m.authStatus?.mode === 'password',
      display: entity === 'Displays',
      addText: m.t(
        {
          ParkingLots: 'addParkingLot',
          ParkingLevels: 'addParkingLevel',
          ParkingSpaces: 'addParkingSpace'
        }[entity] || 'newEntry'
      ),
      info: m.t(
        entity === 'Rules'
          ? 'rulesText'
          : entity === 'Integrations'
            ? 'integrationsText'
            : 'editorHelp'
      )
    };
  }
  function floorEditor(m) {
    const locations = m.planEditorLocations(),
      id = m.planFloorID || m.filters.floor || locations[0]?.ID,
      lot = m.maps.Buildings[id],
      floor =
        m.maps.Floors[id] ||
        (lot?.kind === 'PARKING' ? m.data.Floors.find(f => f.building_ID === id) : null);
    const objects = m.data.FloorObjects.filter(o => o.floor_ID === floor?.ID).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      selected = objects.find(o => o.ID === m.planObjectID);
    if (floor) m.planFloorID = floor.ID;
    if (!m.planDirty) m.planDraft = selected ? { ...selected } : null;
    m.planViews ||= {};
    return {
      locations,
      locationID: floor?.ID || id || '',
      parking: lot?.kind === 'PARKING',
      floor: floor
        ? { ...floor, floorPlan: floor.floorPlan || '', planImage: floor.planImage || '' }
        : null,
      dimensions: floor ? m.t('imageDimensions', [floor.planWidth, floor.planHeight]) : '',
      objects,
      objectOptions: [{ ID: '', name: m.t('none') }, ...objects],
      selectedID: selected?.ID || '',
      selected: selected || null,
      draft: m.planDraft ? { ...m.planDraft, radius: String(m.planDraft.radius) } : null,
      resources: [
        { ID: '', name: m.t('none') },
        ...options(m.data.Resources.filter(r => r.floor_ID === floor?.ID))
      ],
      types: (m.isParkingFloor(floor)
        ? ['PARKING', 'ZONE', 'OTHER']
        : ['ROOM', 'DESK', 'PARKING', 'ZONE', 'OTHER']
      ).map(ID => ({ ID, name: m.t(ID) })),
      viewState: m.planViews[floor?.ID] || null
    };
  }
  function display(m) {
    const r = m.maps.Resources[m.routeArgs?.id];
    if (!r) return { found: false };
    const zone = m.zone(r),
      now = Date.now(),
      rows = m.data.Bookings.filter(
        b => b.resource_ID === r.ID && b.status === 'CONFIRMED' && Date.parse(b.endAt) > now
      ).sort((a, b) => a.startAt.localeCompare(b.startAt)),
      current = rows.find(b => Date.parse(b.startAt) <= now),
      next = rows.find(b => Date.parse(b.startAt) > now),
      p = m.place(r),
      available =
        r.active &&
        p.floor?.active &&
        p.building?.active &&
        p.site?.active &&
        (!p.company || p.company.active);
    return {
      found: !(
        (m.routeArgs.kind === 'room' && r.type !== 'ROOM') ||
        (m.routeArgs.kind === 'parking' && r.type !== 'PARKING') ||
        (m.routeArgs.kind === 'desk' && r.type === 'ROOM')
      ),
      name: r.name,
      type: m.t(r.type),
      location: location(m, r),
      zone,
      day: Time.pretty(Time.date(now, zone), m.language),
      clock: Time.clock(now, zone),
      status: m.t(!available ? 'unavailable' : current ? 'inUse' : 'available'),
      state: !available ? 'unavailable' : current ? 'reserved' : 'available',
      current: current ? booking(m, current) : null,
      next: next ? booking(m, next) : null,
      remaining: current
        ? m.t('remainingMinutes', [
            Math.max(0, Math.ceil((Date.parse(current.endAt) - now) / 60000))
          ])
        : '',
      until: next ? m.t('availableUntilTime', [bookingTime(m, next)]) : m.t('noNext'),
      footer: m.t(m.disconnected || m.deviceError ? 'displayDisconnected' : 'displayReadOnly')
    };
  }
  return {
    dashboard,
    reservations,
    bookings,
    team,
    schedule,
    users,
    admin,
    floorEditor,
    display,
    booking,
    bookingTime,
    location,
    options
  };
});
