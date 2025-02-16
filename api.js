'use strict';

module.exports = {
    // Log message
    async log({ homey, body }) {
        if (body && body.message) {
            homey.app.log(body.message);
            return { success: true };
        }
        return { success: false };
    },

    // Get all devices
    async getDevices({ homey }) {
        return await homey.app.getDevices();
    }
} 