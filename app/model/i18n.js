sap.ui.define(
  ['sap/base/i18n/ResourceBundle', 'sap/base/i18n/Localization'],
  function (ResourceBundle, Localization) {
    'use strict';
    const bundles = new Map();
    let currentLanguage = storedLanguage();
    function storedLanguage() {
      try {
        return localStorage.getItem('rsvroom.language') === 'de' ? 'de' : 'en';
      } catch {
        return 'en';
      }
    }
    function language() {
      return currentLanguage;
    }
    async function load() {
      await Promise.all(
        ['en', 'de'].map(async locale => {
          bundles.set(
            locale,
            await ResourceBundle.create({
              url: sap.ui.require.toUrl('rsvroom/i18n/i18n.properties'),
              locale,
              supportedLocales: ['en', 'de'],
              fallbackLocale: 'en',
              async: true
            })
          );
        })
      );
      setLanguage(language());
    }
    function setLanguage(locale) {
      locale = locale === 'de' ? 'de' : 'en';
      currentLanguage = locale;
      Localization.setLanguage(locale);
      document.documentElement.lang = locale;
      document.title = text(locale, 'appTitle');
      try {
        localStorage.setItem('rsvroom.language', locale);
      } catch {
        /* Storage is optional. */
      }
    }
    function text(locale, key, args) {
      const bundle = bundles.get(locale) || bundles.get('en');
      return bundle?.hasText(key) ? bundle.getText(key, args) : key;
    }
    return { load, language, setLanguage, text, bundle: locale => bundles.get(locale) };
  }
);
