sap.ui.define(['rsvroom/model/Time'], function (Time) {
  'use strict';
  return class BookingModel {
    constructor(state) {
      this.state = state;
    }

    async save({ resource, booking, title, day, start, end, attendees }) {
      if (!title.trim()) throw new Error('checkRequired');
      const interval = Time.interval(day, start, end, this.state.zone(resource));
      const payload = {
        resource_ID: resource.ID,
        user_ID: booking?.user_ID || this.state.user.ID,
        title: title.trim(),
        attendeeCount: attendees,
        ...interval
      };
      return booking
        ? this.state.api.update('Bookings', booking.ID, payload)
        : this.state.api.create('Bookings', payload);
    }

    cancel(booking) {
      return this.state.api.update('Bookings', booking.ID, { status: 'CANCELLED' });
    }

    remove(booking) {
      return this.state.api.remove('Bookings', booking.ID);
    }
  };
});
