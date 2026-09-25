const cds = require('@sap/cds');
const Booking = require('../model/BookingModel');
const Account = require('../model/AccountModel');
const Display = require('../model/DisplayModel');
const authorize = require('../model/AccessPolicy');
const writeQueues = new WeakMap();

module.exports = class BookingController extends cds.ApplicationService {
  handle(req) {
    if (!['CREATE', 'UPDATE', 'DELETE', 'setUserPassword', 'provisionDevice'].includes(req.event))
      return authorize(req).then(() => super.handle(req));
    // Validate and write together so concurrent operations in a changeset
    // see prior changes. The SQLite pool serializes separate transactions.
    const context = this.context || req.context;
    const earlier = writeQueues.get(context) || Promise.resolve();
    const current = earlier
      .catch(() => {})
      .then(async () => {
        await authorize(req);
        await Booking.prepareCreate(req);
        return super.handle(req);
      });
    writeQueues.set(context, current);
    return current.finally(() => {
      if (writeQueues.get(context) === current) writeQueues.delete(context);
    });
  }

  init() {
    this.before(['CREATE', 'UPDATE'], '*', req => Booking.validateWrite(req));
    this.before('DELETE', '*', req => Booking.validateDelete(req));
    this.on('currentUser', req => Account.currentUser(req));
    this.on('setUserPassword', req => Account.setUserPassword(req));
    this.after('DELETE', 'Users', (_result, req) => Account.deleteUserSessions(_result, req));
    this.on('provisionDevice', req => Display.provisionDevice(req));
    this.on('deviceHeartbeat', req => Display.deviceHeartbeat(req));
    this.on('displaySnapshot', req => Display.displaySnapshot(req));
    return super.init();
  }
};
