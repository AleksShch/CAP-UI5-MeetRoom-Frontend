const Auth = require('../model/AuthModel');
const Response = require('../view/AuthResponse');
const { token } = require('../middleware/session');

module.exports = class AuthController {
  constructor() {
    this.attempts = new Map();
  }
  async status(_req, res) {
    res.json(await Auth.status());
  }
  async profiles(_req, res) {
    if (!Auth.profileMode()) return res.sendStatus(404);
    res.json(await Auth.profiles());
  }
  async session(req, res) {
    const user = await Auth.identity(token(req));
    if (!user) return res.status(401).json({ error: { message: 'LOGIN_REQUIRED' } });
    res.json(Auth.safeUser(user));
  }
  async login(req, res) {
    if (!Auth.profileMode()) {
      const now = Date.now();
      for (const [ip, entry] of this.attempts) if (entry.until < now) this.attempts.delete(ip);
      const attempt = this.attempts.get(req.ip) || { count: 0, until: now + 60000 };
      if (++attempt.count > 10)
        return res.status(429).json({ error: { message: 'LOGIN_RATE_LIMIT' } });
      this.attempts.set(req.ip, attempt);
    }
    const result = await Auth.login(req.body || {}, {
      setup: req.path === '/setup',
      previousToken: token(req)
    });
    this.attempts.delete(req.ip);
    Response.login(req, res, result);
  }
  async logout(req, res) {
    await Auth.logout(token(req));
    Response.logout(req, res);
  }
};
