using { rsvroom as db } from '../db/schema';

@path: '/odata/v4/booking'
@Capabilities.DeepInsertSupport.Supported: false
@Capabilities.DeepUpdateSupport.Supported: false
@cds.server.body_parser.limit: '8mb'
service BookingService {
  entity Companies as projection on db.Companies;
  entity CompanyDomains as projection on db.CompanyDomains;
  entity Sites as projection on db.Sites;
  entity Buildings as projection on db.Buildings;
  entity Floors as projection on db.Floors;
  entity FloorObjects as projection on db.FloorObjects;

  @cds.redirection.target: true
  entity Resources as projection on db.Resources;

  entity Users as projection on db.Users excluding { passwordHash };
  entity Teams as projection on db.Teams;
  entity TeamMembers as projection on db.TeamMembers;
  entity Bookings as projection on db.Bookings;
  entity OpeningHours as projection on db.OpeningHours;
  entity WorkSchedules as projection on db.WorkSchedules;
  entity WorkDays as projection on db.WorkDays;
  entity Equipment as projection on db.Equipment;
  entity ResourceEquipment as projection on db.ResourceEquipment;
  entity Displays as projection on db.Displays excluding { tokenHash };

  action provisionDevice(deviceID : UUID) returns String;
  action deviceHeartbeat(deviceID : UUID, token : String) returns Boolean;
  action displaySnapshot(deviceID : UUID, token : String) returns LargeString;
  function currentUser() returns Users;
  action setUserPassword(userID : UUID, password : String, currentPassword : String) returns Boolean;

  @readonly
  @cds.redirection.target: false
  entity Rooms as projection on db.Resources where type = 'ROOM';

  @readonly
  @cds.redirection.target: false
  entity Workplaces as projection on db.Resources where type = 'WORKPLACE';
}
