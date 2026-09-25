sap.ui.define(['rsvroom/service/Notifications'], function (U) {
  'use strict';
  return class ReservationsController {
    constructor(app) {
      this.app = app;
      this.model = app.model;
    }
    selectBookingResource(id) {
      const selectedID = id || null;
      if (this.model.selectedID === selectedID) {
        return;
      }
      this.model.selectedID = selectedID;
      this.model.selectedAreaID = null;
      this.app.refresh();
    }

    saveBooking({ title, day, start, end, resource, booking, attendees, save, dialog }) {
      return this.app.run(async () => {
        save.setEnabled(false);
        try {
          await this.model.bookings.save({
            resource,
            booking,
            title: title.getValue(),
            day: day.getValue(),
            start: start.getValue(),
            end: end.getValue(),
            attendees: attendees.getValue()
          });
          dialog.close();
          await this.app.reload();
          U.MessageToast.show(this.model.t(booking ? 'saved' : 'booked'));
        } finally {
          save.setEnabled(true);
        }
      });
    }

    cancelBooking(booking) {
      U.MessageBox.confirm(this.model.t('cancelConfirm'), {
        onClose: action => {
          if (action === U.MessageBox.Action.OK)
            this.app.run(async () => {
              await this.model.bookings.cancel(booking);
              await this.app.reload();
              U.MessageToast.show(this.model.t('cancelled'));
            });
        }
      });
    }

    deleteBooking(booking) {
      if (!this.model.canDeleteBooking(booking)) return;
      U.MessageBox.confirm(
        this.model.t('deleteBookingConfirm', [
          this.model.maps.Users[booking.user_ID]?.displayName || ''
        ]),
        {
          onClose: action => {
            if (action === U.MessageBox.Action.OK)
              this.app.run(async () => {
                await this.model.bookings.remove(booking);
                await this.app.reload();
                U.MessageToast.show(this.model.t('bookingDeleted'));
              });
          }
        }
      );
    }
  };
});
