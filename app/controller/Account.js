sap.ui.define(['rsvroom/service/Notifications'], function (U) {
  'use strict';
  return class AccountController {
    constructor(app) {
      this.app = app;
      this.model = app.model;
    }
    async showLogin() {
      this.model.authEpoch = (this.model.authEpoch || 0) + 1;
      this.model.ready = false;
      this.model.user = null;
      this.model.userID = null;
      this.model.data = {};
      this.model.maps = {};
      this.app.controls.dialog?.close();
      this.model.planDirty = false;
      this.model.planDraft = null;
      this.model.weekDirty = false;
      this.model.weekCacheKey = null;
      try {
        this.model.authStatus = await this.model.api.auth('status');
        if (this.model.authStatus.mode === 'profile')
          this.model.profiles = await this.model.api.auth('profiles');
        this.model.profileLoadError = false;
      } catch {
        this.model.authStatus = { mode: 'profile' };
        this.model.profiles = [];
        this.model.profileLoadError = true;
      }
      this.app.refresh();
    }

    async signInPassword({ email, password, setup, token }) {
      if (!email.trim() || !password) throw new Error('checkRequired');
      await this.model.api.auth(setup ? 'setup' : 'login', {
        email,
        password,
        ...(setup ? { token: token.trim() } : {})
      });
      this.model.authEpoch = (this.model.authEpoch || 0) + 1;
      if (await this.app._load()) {
        this.app._applyRoute();
        await this.app.refresh();
      }
    }

    chooseProfile() {
      if (!this.model.user) {
        this.app.refresh();
        return;
      }
      if (this.model.authStatus?.mode === 'profile') {
        this.app.controllers.FloorEditor.discardPlan(() =>
          this.app.run(async () => {
            this.model.profiles = await this.model.api.auth('profiles');
            this.app.dialogs.profile();
          })
        );
      } else this.app.dialogs.account();
    }

    async signInProfile(userID) {
      if (!userID) throw new Error('PROFILE_UNAVAILABLE');
      await this.model.api.auth('login', { userID });
      this.model.storage.set('rsvroom.user', userID);
      this.model.authEpoch = (this.model.authEpoch || 0) + 1;
      this.model.ready = false;
      this.model.user = null;
      this.model.userID = null;
      this.model.siteID = null;
      this.model.selectedID = null;
      this.model.selectedAreaID = null;
      this.model.planDirty = false;
      this.model.planDraft = null;
      this.model.planObjectID = null;
      this.model.weekDirty = false;
      this.model.weekCacheKey = null;
      this.model.bookingsScope = 'mine';
      await this.app._load();
      if (
        (['admin', 'planEditor'].includes(this.model.route) && !this.model.isAdmin()) ||
        (this.model.route === 'users' && !this.model.isKeyUser())
      )
        this.app.nav('dashboard');
      this.app._applyRoute();
      this.app.refresh();
    }

    changePassword({ password, confirmation, user, own, current, dialog }) {
      return this.app.run(async () => {
        if (password.getValue() !== confirmation.getValue()) throw new Error('passwordMismatch');
        if (password.getValue().length < 12) throw new Error('PASSWORD_LENGTH');
        await this.model.api.action('setUserPassword', {
          userID: user.ID,
          password: password.getValue(),
          currentPassword: own ? current.getValue() : null
        });
        dialog.close();
        U.MessageToast.show(this.model.t('passwordSaved'));
        if (own) await this.app.controllers.Account.showLogin();
      });
    }
    signOut(dialog) {
      return this.app.run(async () => {
        await this.model.api.auth('logout', {});
        dialog.close();
        await this.showLogin();
      });
    }
  };
});
