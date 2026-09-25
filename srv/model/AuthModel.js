const cds = require('@sap/cds');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
  scrypt: derive
} = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(derive);
const lifetime = 12 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const setupFile = () =>
  path.resolve(cds.root, process.env.RSVROOM_SETUP_TOKEN_FILE || '.data/admin-setup-token');
const safeUser = row => {
  const { passwordHash, ...user } = row;
  return user;
};
const profileMode = () => process.env.RSVROOM_AUTH_MODE !== 'password';

async function initializeProfiles() {
  await cds.tx(async tx => {
    const marker = 'profile-roles-v1';
    if (await tx.run(cds.ql.SELECT.one.from('rsvroom.AuthSettings').where({ ID: marker }))) return;
    const company = await tx.run(
      cds.ql.SELECT.one.from('rsvroom.Companies').where({ active: true })
    );
    if (!company) return;
    for (const [role, suffix, displayName] of [
      ['ADMIN', '1', 'Demo Administrator'],
      ['KEY_USER', '2', 'Demo Key User'],
      ['USER', '3', 'Demo User']
    ]) {
      const users = await tx.run(
        cds.ql.SELECT.from('rsvroom.Users').where({ active: true }).orderBy('ID')
      );
      if (users.some(user => user.role === role)) continue;
      const candidate = users.find(
        user => user.ID === '60000000-0000-4000-8000-00000000000' + suffix && user.role === 'USER'
      );
      if (candidate)
        await tx.run(cds.ql.UPDATE('rsvroom.Users').set({ role }).where({ ID: candidate.ID }));
      else
        await tx.run(
          cds.ql.INSERT.into('rsvroom.Users').entries({
            ID: randomUUID(),
            company_ID: company.ID,
            displayName,
            email: `demo-${role.toLowerCase()}-${randomBytes(4).toString('hex')}@example.invalid`,
            role,
            active: true
          })
        );
    }
    await tx.run(cds.ql.INSERT.into('rsvroom.AuthSettings').entries({ ID: marker }));
  });
}

async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw Object.assign(new Error('PASSWORD_LENGTH'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [, salt, expected] = String(encoded || '').split(':');
  const key = await scrypt(password, salt || 'rsvroom-invalid-password', 64);
  return (
    !!expected && expected.length === 128 && timingSafeEqual(key, Buffer.from(expected, 'hex'))
  );
}

async function setupNeeded(tx) {
  const initialized = await tx.run(
    cds.ql.SELECT.one
      .from('rsvroom.Users')
      .columns('ID')
      .where({ passwordHash: { '!=': null } })
  );
  return !initialized;
}

async function initialize() {
  if (profileMode()) {
    await initializeProfiles();
    return;
  }
  const db = await cds.connect.to('db');
  if (!(await setupNeeded(db))) return;
  const file = setupFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  console.log('First administrator setup: open the app and use the token in ' + file);
  return (await fs.readFile(file, 'utf8')).trim();
}

async function identity(sessionToken) {
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) return;
  const db = await cds.connect.to('db');
  const session = await db.run(
    cds.ql.SELECT.one.from('rsvroom.AuthSessions').where({
      ID: hash(sessionToken),
      authMode: profileMode() ? 'profile' : 'password',
      expiresAt: { '>': new Date().toISOString() }
    })
  );
  if (!session) return;
  return db.run(
    cds.ql.SELECT.one.from('rsvroom.Users').where({ ID: session.userID, active: true })
  );
}

async function createSession(tx, user, previousToken) {
  const value = randomBytes(32).toString('hex');
  await tx.run(cds.ql.DELETE.from('rsvroom.AuthSessions').where({ ID: hash(previousToken) }));
  await tx.run(
    cds.ql.DELETE.from('rsvroom.AuthSessions').where({
      expiresAt: { '<=': new Date().toISOString() }
    })
  );
  await tx.run(
    cds.ql.INSERT.into('rsvroom.AuthSessions').entries({
      ID: hash(value),
      userID: user.ID,
      authMode: profileMode() ? 'profile' : 'password',
      expiresAt: new Date(Date.now() + lifetime).toISOString()
    })
  );
  return { user: safeUser(user), token: value };
}

async function login(input, { setup = false, previousToken = '' } = {}) {
  const result = await cds.tx(async tx => {
    if (profileMode()) {
      if (setup) throw Object.assign(new Error('PROFILE_LOGIN_ENABLED'), { status: 409 });
      const user =
        typeof input?.userID === 'string' &&
        (await tx.run(
          cds.ql.SELECT.one.from('rsvroom.Users').where({ ID: input.userID, active: true })
        ));
      if (!user) throw Object.assign(new Error('PROFILE_UNAVAILABLE'), { status: 401 });
      return createSession(tx, user, previousToken);
    }
    const email = String(input.email || '')
      .trim()
      .toLowerCase();
    const users = await tx.run(cds.ql.SELECT.from('rsvroom.Users').where({ email, active: true }));
    const user = users.length === 1 ? users[0] : undefined;
    if (setup) {
      if (!(await setupNeeded(tx)))
        throw Object.assign(new Error('SETUP_UNAVAILABLE'), { status: 409 });
      const expected = await fs.readFile(setupFile(), 'utf8');
      if (
        !timingSafeEqual(
          Buffer.from(hash(String(input.token || ''))),
          Buffer.from(hash(expected.trim()))
        )
      )
        throw Object.assign(new Error('SETUP_TOKEN_INVALID'), { status: 403 });
      if (!user) throw Object.assign(new Error('SETUP_USER_INVALID'), { status: 400 });
      user.role = 'ADMIN';
      user.passwordHash = await passwordHash(input.password);
      await tx.run(
        cds.ql
          .UPDATE('rsvroom.Users')
          .set({ role: user.role, passwordHash: user.passwordHash })
          .where({ ID: user.ID })
      );
    } else if (!(await verifyPassword(input.password, user?.passwordHash)) || !user) {
      throw Object.assign(new Error('LOGIN_INVALID'), { status: 401 });
    }
    return createSession(tx, user, previousToken);
  });
  if (setup) await fs.unlink(setupFile()).catch(() => {});
  return result;
}

async function logout(sessionToken) {
  const db = await cds.connect.to('db');
  await db.run(cds.ql.DELETE.from('rsvroom.AuthSessions').where({ ID: hash(sessionToken) }));
}

async function status() {
  const db = await cds.connect.to('db');
  return {
    mode: profileMode() ? 'profile' : 'password',
    setupRequired: !profileMode() && (await setupNeeded(db))
  };
}

async function profiles() {
  if (!profileMode()) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  const db = await cds.connect.to('db');
  return db.run(
    cds.ql.SELECT.from('rsvroom.Users')
      .columns('ID', 'displayName', 'email', 'role', 'company_ID')
      .where({ active: true })
      .orderBy('displayName')
  );
}

module.exports = {
  initialize,
  passwordHash,
  verifyPassword,
  safeUser,
  profileMode,
  identity,
  login,
  logout,
  status,
  profiles,
  lifetime
};
