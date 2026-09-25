const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const roles = new Set(['USER', 'KEY_USER', 'ADMIN']);
const writes = new Set(['CREATE', 'UPDATE', 'DELETE']);

module.exports = async function authorize(req) {
  if (['deviceHeartbeat', 'displaySnapshot'].includes(req.event)) return;
  if (!req.user?.is('authenticated-user')) req.reject(401, 'LOGIN_REQUIRED');
  const tx = cds.tx(req);
  // Re-read the role inside the transaction: changes take effect immediately,
  // including earlier writes in the same atomic batch.
  const actor = await tx.run(SELECT.one.from('rsvroom.Users').where({ ID: req.user.id }));
  if (!actor?.active || !roles.has(actor.role)) req.reject(403, 'ACCESS_DENIED');
  const admin = actor.role === 'ADMIN';
  const keyUser = admin || actor.role === 'KEY_USER';
  req.actor = actor;
  if (req.event === 'READ' || req.event === 'currentUser') return;
  if (req.event === 'setUserPassword') {
    if (require('./AuthModel').profileMode()) req.reject(403, 'PROFILE_LOGIN_ENABLED');
    if (!admin && req.data.userID !== actor.ID) {
      const target = await tx.run(SELECT.one.from('rsvroom.Users').where({ ID: req.data.userID }));
      if (
        !(
          keyUser &&
          target?.role === 'USER' &&
          target.company_ID === actor.company_ID &&
          target.createdBy === actor.ID &&
          !target.passwordHash
        )
      )
        req.reject(403, 'ACCESS_DENIED');
    }
    return;
  }
  if (req.event === 'provisionDevice') {
    if (!admin) req.reject(403, 'ACCESS_DENIED');
    return;
  }
  if (!writes.has(req.event)) req.reject(403, 'ACCESS_DENIED');
  const entity = req.target?.name.split('.').pop();
  const rows = req.event === 'CREATE' ? [] : await tx.run(SELECT.from(req.subject).limit(2));
  if (rows.length > 1) req.reject(403, 'ACCESS_DENIED');
  const previous = rows[0];
  if (entity === 'Bookings' || entity === 'WorkDays') {
    if (req.event === 'CREATE') {
      req.data.user_ID ??= actor.ID;
      if (req.data.user_ID !== actor.ID) req.reject(403, 'OWN_RECORDS_ONLY');
    } else {
      if (previous && previous.user_ID !== actor.ID) {
        const owner = await tx.run(
          SELECT.one.from('rsvroom.Users').columns('company_ID').where({ ID: previous.user_ID })
        );
        if (
          !(
            entity === 'Bookings' &&
            req.event === 'DELETE' &&
            keyUser &&
            (admin || owner?.company_ID === actor.company_ID)
          )
        )
          req.reject(403, 'OWN_RECORDS_ONLY');
      }
      if (Object.hasOwn(req.data, 'user_ID') && req.data.user_ID !== previous?.user_ID)
        req.reject(403, 'BOOKING_OWNER_IMMUTABLE');
    }
    return;
  }
  if (entity === 'Users') {
    if (!admin) {
      if (!keyUser || req.event !== 'CREATE') req.reject(403, 'ACCESS_DENIED');
      req.data.company_ID ??= actor.company_ID;
      if (req.data.company_ID !== actor.company_ID || (req.data.role && req.data.role !== 'USER'))
        req.reject(403, 'ROLE_ASSIGNMENT_DENIED');
      req.data.role = 'USER';
    }
    if (
      previous?.active &&
      previous.role === 'ADMIN' &&
      (req.event === 'DELETE' ||
        req.data.active === false ||
        (req.data.role && req.data.role !== 'ADMIN'))
    ) {
      const other = await tx.run(
        SELECT.one
          .from('rsvroom.Users')
          .columns('ID')
          .where({
            role: 'ADMIN',
            active: true,
            ...(!require('./AuthModel').profileMode() ? { passwordHash: { '!=': null } } : {}),
            ID: { '!=': previous.ID }
          })
      );
      if (!other) req.reject(409, 'LAST_ADMIN_REQUIRED');
    }
    return;
  }
  if (!admin) req.reject(403, 'ACCESS_DENIED');
};
