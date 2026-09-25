const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const auth = require('./AuthModel');

module.exports = {
  currentUser(req) {
    return auth.safeUser(req.actor);
  },
  async setUserPassword(req) {
    const tx = cds.tx(req);
    const target = await tx.run(SELECT.one.from('rsvroom.Users').where({ ID: req.data.userID }));
    if (!target) req.reject(404, 'ENTRY_NOT_FOUND', ['Users']);
    if (
      target.ID === req.actor.ID &&
      !(await auth.verifyPassword(req.data.currentPassword, target.passwordHash))
    )
      req.reject(403, 'CURRENT_PASSWORD_INVALID');
    let passwordHash;
    try {
      passwordHash = await auth.passwordHash(req.data.password);
    } catch {
      req.reject(400, 'PASSWORD_LENGTH');
    }
    await tx.run(cds.ql.UPDATE('rsvroom.Users').set({ passwordHash }).where({ ID: target.ID }));
    await tx.run(cds.ql.DELETE.from('rsvroom.AuthSessions').where({ userID: target.ID }));
    return true;
  },

  async deleteUserSessions(_result, req) {
    if (req.data.ID)
      await cds
        .tx(req)
        .run(cds.ql.DELETE.from('rsvroom.AuthSessions').where({ userID: req.data.ID }));
  }
};
