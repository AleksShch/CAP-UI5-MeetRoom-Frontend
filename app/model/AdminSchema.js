sap.ui.define([], function () {
  'use strict';
  const fields = {
    Companies: [
      ['name', 'name', 'text', true],
      ['active', 'active', 'bool']
    ],
    CompanyDomains: [
      ['company_ID', 'company', 'Companies', true],
      ['domain', 'domain', 'text', true],
      ['primary', 'primary', 'bool'],
      ['active', 'active', 'bool']
    ],
    Sites: [
      ['company_ID', 'company', 'Companies', true],
      ['code', 'code', 'text', true],
      ['name', 'name', 'text', true],
      ['countryCode', 'country', 'text', true],
      ['city', 'city', 'text', true],
      ['address', 'address', 'text'],
      ['timeZone', 'timeZone', 'text', true],
      ['locale', 'locale', 'text'],
      ['siteType', 'siteType', 'text'],
      ['active', 'active', 'bool']
    ],
    Buildings: [
      ['site_ID', 'office', 'Sites', true],
      ['code', 'code', 'text', true],
      ['name', 'name', 'text', true],
      ['active', 'active', 'bool']
    ],
    Floors: [
      ['building_ID', 'building', 'Buildings', true],
      ['code', 'code', 'text', true],
      ['name', 'name', 'text', true],
      ['number', 'floorNumber', 'number'],
      ['planWidth', 'planWidth', 'number', true],
      ['planHeight', 'planHeight', 'number', true],
      ['active', 'active', 'bool']
    ],
    Resources: [
      ['floor_ID', 'floor', 'Floors', true],
      ['type', 'type', ['ROOM', 'WORKPLACE', 'LOCKER', 'CAR', 'OTHER'], true],
      ['code', 'code', 'text', true],
      ['name', 'name', 'text', true],
      ['capacity', 'capacity', 'number', true],
      ['monitorCount', 'monitorCount', 'number'],
      ['roomType', 'roomType', 'text'],
      ['workplaceType', 'workplaceType', 'text'],
      ['mapX', 'mapX', 'number'],
      ['mapY', 'mapY', 'number'],
      ['restrictedTeam_ID', 'restrictedTeam', 'Teams'],
      ['active', 'active', 'bool']
    ],
    Users: [
      ['company_ID', 'company', 'Companies', true],
      ['displayName', 'name', 'text', true],
      ['email', 'email', 'text', true],
      ['role', 'role', ['USER', 'KEY_USER', 'ADMIN'], true],
      ['defaultSite_ID', 'defaultSite', 'Sites'],
      ['active', 'active', 'bool']
    ],
    Teams: [
      ['company_ID', 'company', 'Companies', true],
      ['name', 'name', 'text', true]
    ],
    TeamMembers: [
      ['team_ID', 'chooseTeam', 'Teams', true],
      ['user_ID', 'employee', 'Users', true]
    ],
    Equipment: [
      ['company_ID', 'company', 'Companies', true],
      ['name', 'name', 'text', true]
    ],
    ResourceEquipment: [
      ['resource_ID', 'resource', 'Resources', true],
      ['equipment_ID', 'equipment', 'Equipment', true],
      ['quantity', 'quantity', 'number', true]
    ],
    Displays: [
      ['resource_ID', 'resource', 'Resources', true],
      ['name', 'name', 'text', true],
      ['deviceId', 'deviceId', 'text', true],
      ['active', 'active', 'bool']
    ],
    OpeningHours: [
      ['site_ID', 'office', 'Sites', true],
      ['dayOfWeek', 'weekday', 'number', true],
      ['opensAt', 'start', 'text', true],
      ['closesAt', 'end', 'text', true]
    ],
    WorkSchedules: [
      ['user_ID', 'employee', 'Users', true],
      ['site_ID', 'office', 'Sites', true],
      ['dayOfWeek', 'weekday', 'number', true],
      ['startTime', 'start', 'text', true],
      ['endTime', 'end', 'text', true]
    ]
  };
  fields.ParkingLots = fields.Buildings;
  fields.ParkingLevels = fields.Floors.map(field =>
    field[0] === 'building_ID' ? ['building_ID', 'parkingLot', 'ParkingLots', true] : field
  );
  fields.ParkingSpaces = [
    ['floor_ID', 'parkingLevel', 'ParkingLevels', true],
    ['code', 'code', 'text', true],
    ['name', 'name', 'text', true],
    ['mapX', 'mapX', 'number'],
    ['mapY', 'mapY', 'number'],
    ['restrictedTeam_ID', 'restrictedTeam', 'Teams'],
    ['active', 'active', 'bool']
  ];
  const labels = {
    Companies: 'companies',
    CompanyDomains: 'domains',
    Sites: 'sites',
    Buildings: 'buildings',
    Floors: 'floors',
    Resources: 'resources',
    ParkingLots: 'parkingLots',
    ParkingLevels: 'parkingLevels',
    ParkingSpaces: 'parkingSpaces',
    Users: 'users',
    Teams: 'teams',
    TeamMembers: 'teamMembers',
    Equipment: 'equipment',
    ResourceEquipment: 'resourceEquipment',
    Displays: 'devices',
    OpeningHours: 'openingHours',
    WorkSchedules: 'workSchedules',
    Plans: 'planEditor',
    Rules: 'rules',
    Integrations: 'integrations'
  };
  const parentFields = {
    CompanyDomains: 'company_ID',
    Sites: 'company_ID',
    Buildings: 'site_ID',
    Floors: 'building_ID',
    Resources: 'floor_ID',
    Users: 'company_ID',
    Teams: 'company_ID',
    Equipment: 'company_ID'
  };

  return { fields, labels, parentFields };
});
