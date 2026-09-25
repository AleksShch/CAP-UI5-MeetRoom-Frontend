module.exports = {
  configuration(res, config) {
    res
      .type('application/javascript')
      .set('Cache-Control', 'no-store')
      .send('window.RSVROOM_CONFIG=' + JSON.stringify(config) + ';');
  }
};
