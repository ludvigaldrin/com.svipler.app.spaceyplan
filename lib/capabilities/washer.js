module.exports = {
    id: 'washer',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            return {
                status: device.capabilitiesObj?.washer_status?.value ?? null,
                programName: device.capabilitiesObj?.program_name?.value ?? null,
                remainingTime: device.capabilitiesObj?.program_remaining_time?.value ?? null,
                endTime: device.capabilitiesObj?.program_end_time?.value ?? null
            };
        } catch (error) {
            homey.app.error('[Washer] Error getting state:', error);
            throw error;
        }
    },

    // Read-only status capability (V-ZUG and similar integrations expose
    // no start/stop/pause capability) — no set() action available.
    async set() {
        throw new Error('washer is read-only');
    }
};
