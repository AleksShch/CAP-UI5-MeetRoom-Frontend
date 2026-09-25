const { cookieName } = require('../middleware/session');
const { lifetime } = require('../model/AuthModel');

module.exports = {
  login(req, res, result) {
    res.cookie(cookieName, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: lifetime,
      path: '/'
    });
    res.json(result.user);
  },
  logout(req, res) {
    res.clearCookie(cookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure
    });
    res.sendStatus(204);
  },
  error(error, _req, res, _next) {
    res
      .status(error.status || 500)
      .json({ error: { message: error.status ? error.message : 'LOGIN_FAILED' } });
  }
};
