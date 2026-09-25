const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

module.exports = {
  async provisionDevice(req) {
    const device = await cds
      .tx(req)
      .run(SELECT.one.from('rsvroom.Displays').where({ ID: req.data.deviceID }));
    if (!device) req.reject(404, 'DISPLAY_NOT_FOUND');
    if (!device.active) req.reject(409, 'DISPLAY_INACTIVE');
    const token = randomBytes(32).toString('hex');
    await cds.tx(req).run(
      cds.ql
        .UPDATE('rsvroom.Displays')
        .set({ tokenHash: createHash('sha256').update(token).digest('hex'), lastSeen: null })
        .where({ ID: device.ID })
    );
    return token;
  },

  async deviceHeartbeat(req) {
    const device = await cds
      .tx(req)
      .run(SELECT.one.from('rsvroom.Displays').where({ ID: req.data.deviceID }));
    const hash = createHash('sha256')
      .update(String(req.data.token || ''))
      .digest('hex');
    if (
      !device?.active ||
      !device.tokenHash ||
      !timingSafeEqual(Buffer.from(hash), Buffer.from(device.tokenHash))
    )
      req.reject(403, 'DISPLAY_TOKEN_INVALID');
    await cds
      .tx(req)
      .run(
        cds.ql
          .UPDATE('rsvroom.Displays')
          .set({ lastSeen: new Date().toISOString() })
          .where({ ID: device.ID })
      );
    return true;
  },

  async displaySnapshot(req) {
    const tx = cds.tx(req);
    const device = await tx.run(
      SELECT.one.from('rsvroom.Displays').where({ ID: req.data.deviceID })
    );
    const hash = createHash('sha256')
      .update(String(req.data.token || ''))
      .digest('hex');
    if (
      !device?.active ||
      !device.tokenHash ||
      !timingSafeEqual(Buffer.from(hash), Buffer.from(device.tokenHash))
    )
      req.reject(403, 'DISPLAY_TOKEN_INVALID');
    const Resources = await tx.run(
      SELECT.from('rsvroom.Resources').where({ ID: device.resource_ID })
    );
    const Floors = await tx.run(
      SELECT.from('rsvroom.Floors')
        .columns('ID', 'building_ID', 'name', 'active')
        .where({ ID: Resources[0].floor_ID })
    );
    const Buildings = await tx.run(
      SELECT.from('rsvroom.Buildings').where({ ID: Floors[0].building_ID })
    );
    const Sites = await tx.run(SELECT.from('rsvroom.Sites').where({ ID: Buildings[0].site_ID }));
    const Companies = await tx.run(
      SELECT.from('rsvroom.Companies').where({ ID: Sites[0].company_ID })
    );
    const Bookings = await tx.run(
      SELECT.from('rsvroom.Bookings')
        .columns('ID', 'resource_ID', 'user_ID', 'title', 'startAt', 'endAt', 'status')
        .where({
          resource_ID: device.resource_ID,
          status: 'CONFIRMED',
          endAt: { '>': new Date().toISOString() }
        })
    );
    const Users = Bookings.length
      ? await tx.run(
          SELECT.from('rsvroom.Users')
            .columns('ID', 'displayName')
            .where({ ID: { in: [...new Set(Bookings.map(row => row.user_ID))] } })
        )
      : [];
    return JSON.stringify({ Resources, Floors, Buildings, Sites, Companies, Bookings, Users });
  }
};
