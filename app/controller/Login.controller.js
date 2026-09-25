sap.ui.define(['rsvroom/controller/BaseController'], function (Base) {
  return Base.extend('rsvroom.controller.Login', {
    refresh: function () {
      const m = this.model,
        profile = m.authStatus?.mode === 'profile',
        setup = !!m.authStatus?.setupRequired;
      this.setData({
        profile,
        setup,
        title: m.t(profile ? 'chooseProfile' : setup ? 'setupAdministrator' : 'signIn'),
        intro: m.t(
          profile ? 'profileLoginIntro' : setup ? 'setupAdministratorIntro' : 'signInIntro'
        ),
        submitText: m.t(profile ? 'continue' : setup ? 'setupAdministrator' : 'signIn'),
        profiles: (m.profiles || []).map(u => ({
          ...u,
          label: u.displayName + ' · ' + m.t('role_' + u.role)
        })),
        userID: m.user?.ID || m.storage.get('rsvroom.user') || m.profiles?.[0]?.ID || '',
        profileHint: m.t(m.profileLoadError ? 'networkError' : 'noActiveProfiles'),
        email: '',
        password: '',
        token: '',
        busy: false,
        error: ''
      });
    },
    onRetry: function () {
      this.app.controllers.Account.showLogin();
    },
    onSubmit: async function () {
      const view = this.getView(),
        vm = view.getModel('page'),
        d = vm.getData();
      vm.setProperty('/busy', true);
      vm.setProperty('/error', '');
      try {
        if (d.profile) await this.app.controllers.Account.signInProfile(d.userID);
        else await this.app.controllers.Account.signInPassword(d);
      } catch (e) {
        if (!view.isDestroyed()) vm.setProperty('/error', this.model.t(e.message));
      } finally {
        if (!view.isDestroyed()) vm.setProperty('/busy', false);
      }
    }
  });
});
