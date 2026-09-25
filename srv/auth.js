// Stable entry point used by CAP configuration and deployment scripts.
module.exports = Object.assign(require('./middleware/session').authenticate, {
  ...require('./model/AuthModel'),
  routes: require('./routes/auth')
});
