namespace rsvroom;

using { cuid, managed } from '@sap/cds/common';

type ResourceType : String(20) enum {
  ROOM;
  WORKPLACE;
  PARKING;
  LOCKER;
  CAR;
  OTHER;
}

type BookingStatus : String(20) enum {
  CONFIRMED;
  CANCELLED;
}

entity Companies : cuid, managed {
  @mandatory name : String(200) not null;
  active : Boolean not null default true;
  domains : Association to many CompanyDomains on domains.company = $self;
  sites : Association to many Sites on sites.company = $self;
  users : Association to many Users on users.company = $self;
  teams : Association to many Teams on teams.company = $self;
  equipment : Association to many Equipment on equipment.company = $self;
}

@assert.unique: { domain: [domain] }
entity CompanyDomains : cuid, managed {
  @mandatory @assert.target company : Association to Companies not null;
  @mandatory domain : String(253) not null;
  primary : Boolean not null default false;
  active : Boolean not null default true;
}

@assert.unique: { companyCode: [company, code] }
entity Sites : cuid, managed {
  @mandatory @assert.target company : Association to Companies not null;
  @mandatory code : String(40) not null;
  @mandatory name : String(200) not null;
  address : String(500);
  @mandatory countryCode : String(2) not null;
  region : String(100);
  @mandatory city : String(100) not null;
  postalCode : String(20);
  street : String(200);
  houseNumber : String(30);
  @assert.range: [-90, 90] latitude : Decimal(10,7);
  @assert.range: [-180, 180] longitude : Decimal(10,7);
  @mandatory timeZone : String(100) not null;
  locale : String(35);
  siteType : String(40) default 'OFFICE';
  active : Boolean not null default true;
  buildings : Association to many Buildings on buildings.site = $self;
  openingHours : Association to many OpeningHours on openingHours.site = $self;
}

type BuildingKind : String(20) enum { BUILDING; PARKING; }

@assert.unique: { siteCode: [site, code] }
entity Buildings : cuid, managed {
  @mandatory @assert.target site : Association to Sites not null;
  @mandatory code : String(40) not null;
  @mandatory name : String(200) not null;
  @assert.range kind : BuildingKind not null default 'BUILDING';
  active : Boolean not null default true;
  floors : Association to many Floors on floors.building = $self;
}

@assert.unique: { buildingCode: [building, code] }
entity Floors : cuid, managed {
  @mandatory @assert.target building : Association to Buildings not null;
  @mandatory code : String(40) not null;
  @mandatory name : String(200) not null;
  number : Integer;
  floorPlan : LargeString;
  planImage : LargeString;
  planImageName : String(255);
  @assert.range: [100, 10000] planWidth : Integer not null default 1000;
  @assert.range: [100, 10000] planHeight : Integer not null default 600;
  active : Boolean not null default true;
  resources : Association to many Resources on resources.floor = $self;
  objects : Association to many FloorObjects on objects.floor = $self;
}

type FloorObjectType : String(20) enum { ROOM; DESK; PARKING; ZONE; OTHER; }

@assert.unique: { resource: [resource] }
entity FloorObjects : cuid, managed {
  @mandatory @assert.target floor : Association to Floors not null;
  @assert.target resource : Association to Resources;
  @mandatory name : String(200) not null;
  @mandatory @assert.range type : FloorObjectType not null default 'ZONE';
  @assert.range: [0, 10000] x : Decimal(8,2) not null default 0;
  @assert.range: [0, 10000] y : Decimal(8,2) not null default 0;
  @assert.range: [1, 10000] width : Decimal(8,2) not null default 120;
  @assert.range: [1, 10000] height : Decimal(8,2) not null default 80;
  @assert.range: [0, 5000] radius : Decimal(8,2) not null default 12;
  color : String(7) not null default '#3c7967';
  @assert.range: [0, 1] opacity : Decimal(3,2) not null default 0.25;
}

@assert.unique: { floorCode: [floor, code] }
entity Resources : cuid, managed {
  @mandatory @assert.target floor : Association to Floors not null;
  @mandatory @assert.range type : ResourceType not null;
  @mandatory code : String(40) not null;
  @mandatory name : String(200) not null;
  @assert.range: [1, 10000] capacity : Integer not null default 1;
  roomType : String(40);
  workplaceType : String(40);
  @assert.range: [0, 100] monitorCount : Integer not null default 0;
  @assert.range: [0, 10000] mapX : Decimal(8,2);
  @assert.range: [0, 10000] mapY : Decimal(8,2);
  @assert.target restrictedTeam : Association to Teams;
  active : Boolean not null default true;
  bookings : Association to many Bookings on bookings.resource = $self;
  equipment : Association to many ResourceEquipment on equipment.resource = $self;
  displays : Association to many Displays on displays.resource = $self;
}

type UserRole : String(20) enum { USER; KEY_USER; ADMIN; }

@assert.unique: { companyEmail: [company, email] }
entity Users : cuid, managed {
  @mandatory @assert.target company : Association to Companies not null;
  @mandatory email : String(254) not null;
  @mandatory displayName : String(200) not null;
  @assert.range role : UserRole not null default 'USER';
  @readonly @cds.api.ignore passwordHash : String(256);
  @assert.target defaultSite : Association to Sites;
  active : Boolean not null default true;
  memberships : Association to many TeamMembers on memberships.user = $self;
  bookings : Association to many Bookings on bookings.user = $self;
  workSchedules : Association to many WorkSchedules on workSchedules.user = $self;
}

// Session tokens are stored as hashes and never exposed by the OData service.
entity AuthSessions {
  key ID : String(64);
  userID : UUID not null;
  authMode : String(20) not null default 'profile';
  expiresAt : Timestamp not null;
}

entity AuthSettings {
  key ID : String(80);
}

@assert.unique: { companyName: [company, name] }
entity Teams : cuid, managed {
  @mandatory @assert.target company : Association to Companies not null;
  @mandatory name : String(200) not null;
  members : Association to many TeamMembers on members.team = $self;
}

@assert.unique: { teamUser: [team, user] }
entity TeamMembers : cuid, managed {
  @mandatory @assert.target team : Association to Teams not null;
  @mandatory @assert.target user : Association to Users not null;
}

entity Bookings : cuid, managed {
  @mandatory @assert.target resource : Association to Resources not null;
  @mandatory @assert.target user : Association to Users not null;
  @mandatory title : String(200) not null;
  @mandatory startAt : Timestamp not null;
  @mandatory endAt : Timestamp not null;
  @assert.range status : BookingStatus not null default 'CONFIRMED';
  @assert.range: [1, 10000] attendeeCount : Integer not null default 1;
  notes : LargeString;
  @readonly source : String(20) not null default 'RSVROOM';
}

type WorkMode : String(20) enum { OFFICE; HOME; VACATION; BUSINESS_TRIP; }

@assert.unique: { userDate: [user, date] }
entity WorkDays : cuid, managed {
  @mandatory @assert.target user : Association to Users not null;
  @assert.target site : Association to Sites;
  @mandatory date : Date not null;
  @mandatory @assert.range mode : WorkMode not null;
  @mandatory startTime : Time not null default '08:00:00';
  @mandatory endTime : Time not null default '17:00:00';
  notes : String(500);
}

entity OpeningHours : cuid, managed {
  @mandatory @assert.target site : Association to Sites not null;
  // ISO weekday: Monday = 1, Sunday = 7. Times are local to the site.
  @mandatory @assert.range: [1, 7] dayOfWeek : Integer not null;
  @mandatory opensAt : Time not null;
  @mandatory closesAt : Time not null;
}

entity WorkSchedules : cuid, managed {
  @mandatory @assert.target user : Association to Users not null;
  @mandatory @assert.target site : Association to Sites not null;
  // ISO weekday; start/end times use the site's timeZone.
  @mandatory @assert.range: [1, 7] dayOfWeek : Integer not null;
  @mandatory startTime : Time not null;
  @mandatory endTime : Time not null;
}

@assert.unique: { companyName: [company, name] }
entity Equipment : cuid, managed {
  @mandatory @assert.target company : Association to Companies not null;
  @mandatory name : String(200) not null;
  resources : Association to many ResourceEquipment on resources.equipment = $self;
}

@assert.unique: { resourceEquipment: [resource, equipment] }
entity ResourceEquipment : cuid, managed {
  @mandatory @assert.target resource : Association to Resources not null;
  @mandatory @assert.target equipment : Association to Equipment not null;
  @assert.range: [1, 10000] quantity : Integer not null default 1;
}

@assert.unique: { deviceId: [deviceId] }
entity Displays : cuid, managed {
  @mandatory @assert.target resource : Association to Resources not null;
  @mandatory name : String(200) not null;
  @mandatory deviceId : String(200) not null;
  @readonly lastSeen : Timestamp;
  @readonly @cds.api.ignore tokenHash : String(64);
  active : Boolean not null default true;
}
