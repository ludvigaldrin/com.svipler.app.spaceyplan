module.exports = {
    id: 'dryer',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            return {
                status: device.capabilitiesObj?.dryer_status?.value ?? null,
                programName: device.capabilitiesObj?.program_name?.value ?? null,
                remainingTime: device.capabilitiesObj?.program_remaining_time?.value ?? null,
                endTime: device.capabilitiesObj?.program_end_time?.value ?? null
            };
        } catch (error) {
            homey.app.error('[Dryer] Error getting state:', error);
            throw error;
        }
    },

    // Read-only status capability (V-ZUG and similar integrations expose
    // no start/stop/pause capability) — no set() action available.
    async set() {
        throw new Error('dryer is read-only');
    }
};
