module.exports = {
    id: 'ajaxchimestatus',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            const cap = device.capabilitiesObj?.ajax_chime_status;
            if (!cap) {
                throw new Error(`Device has no ajax_chime_status capability: ${deviceId}`);
            }
            return { value: cap.value ?? null, values: cap.values ?? [] };
        } catch (error) {
            homey.app.error('[AjaxChimeStatus] Error getting state:', error);
            throw error;
        }
    },

    // Read-only capability (setable: false in Homey) — no set() action available.
    async set() {
        throw new Error('ajax_chime_status is read-only');
    }
};
