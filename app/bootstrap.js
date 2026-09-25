sap.ui.define(
  ['sap/ui/core/ComponentContainer', 'rsvroom/model/i18n'],
  function (ComponentContainer, I18n) {
    'use strict';
    I18n.load().then(function () {
      document.querySelector('#loading strong').textContent = I18n.text(I18n.language(), 'appName');
      document.querySelector('#loading span').textContent = I18n.text(I18n.language(), 'loading');
      new ComponentContainer({
        name: 'rsvroom',
        async: true,
        height: '100%',
        manifest: true,
        componentCreated: function () {
          document.getElementById('loading')?.remove();
        }
      }).placeAt('content');
    });
  }
);
