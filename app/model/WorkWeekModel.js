sap.ui.define(['rsvroom/model/Time'], function (Time) {
  'use strict';
  return class WorkWeekModel {
    constructor(state) {
      this.state = state;
    }

    draft(monday) {
      const state = this.state;
      const key = state.user.ID + ':' + monday;
      if (state.weekCacheKey !== key) {
        state.weekCacheKey = key;
        state.weekDraft = Array.from({ length: 5 }, (_, index) => {
          const date = Time.addDays(monday, index);
          const saved = state.data.WorkDays.find(
            row => row.user_ID === state.user.ID && row.date === date
          );
          return saved
            ? { ...saved }
            : {
                date,
                mode: '',
                site_ID: state.siteID,
                startTime: '08:00:00',
                endTime: '17:00:00'
              };
        });
      }
      return state.weekDraft;
    }

    operations() {
      return this.state.weekDraft.flatMap(row => {
        if (!row.mode) return row.ID ? [{ method: 'DELETE', url: `WorkDays(${row.ID})` }] : [];
        if (row.startTime >= row.endTime) throw new Error('invalidInterval');
        const body = {
          user_ID: this.state.user.ID,
          date: row.date,
          mode: row.mode,
          site_ID: row.mode === 'OFFICE' ? row.site_ID : null,
          startTime: row.startTime,
          endTime: row.endTime
        };
        return [
          {
            method: row.ID ? 'PATCH' : 'POST',
            url: row.ID ? `WorkDays(${row.ID})` : 'WorkDays',
            body
          }
        ];
      });
    }

    async save() {
      const operations = this.operations();
      if (operations.length) await this.state.api.batch(operations);
      this.state.weekDirty = false;
      this.state.weekCacheKey = null;
    }
  };
});
