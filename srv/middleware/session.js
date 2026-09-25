const cds = require('@sap/cds');
const Auth = require('../model/AuthModel');
const cookieName = 'rsvroom_session';

function token(req) {
  return (
    req.headers.cookie
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) || ''
  );
}

function sameOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true; // CLI clients do not use browser cookies automatically.
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function authenticate(req, res, next) {
  try {
    if (!sameOrigin(req))
      return res.status(403).json({ error: { code: 'ACCESS_DENIED', message: 'ACCESS_DENIED' } });
    const user = await Auth.identity(token(req));
    if (user) cds.context.user = req.user = new cds.User({ id: user.ID, roles: [user.role] });
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate, token, sameOrigin, cookieName };
