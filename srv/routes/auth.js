const express = require('express');
const AuthController = require('../controller/AuthController');
const Response = require('../view/AuthResponse');
const { sameOrigin } = require('../middleware/session');

module.exports = function authRoutes() {
  const router = express.Router();
  const controller = new AuthController();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).json({ error: { message: 'ACCESS_DENIED' } });
    next();
  });
  router.use(express.json({ limit: '8kb' }));
  for (const action of ['status', 'profiles', 'session'])
    router.get('/' + action, controller[action].bind(controller));
  router.post(['/login', '/setup'], controller.login.bind(controller));
  router.post('/logout', controller.logout.bind(controller));
  router.use(Response.error);
  return router;
};
