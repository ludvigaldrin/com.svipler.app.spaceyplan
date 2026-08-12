module.exports = {
    id: 'ajaxhubchime',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            const cap = device.capabilitiesObj?.ajax_hub_chime_enabled;
            if (!cap) {
                throw new Error(`Device has no ajax_hub_chime_enabled capability: ${deviceId}`);
            }
            return { value: cap.value ?? false };
        } catch (error) {
            homey.app.error('[AjaxHubChime] Error getting state:', error);
            throw error;
        }
    },

    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: 'ajax_hub_chime_enabled',
                value: !!value
            });
            return true;
        } catch (error) {
            homey.app.error('[AjaxHubChime] Error setting state:', error);
            throw error;
        }
    }
};
