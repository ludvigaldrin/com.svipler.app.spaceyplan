module.exports = {
    id: 'ajaxsecuritymode',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            const cap = device.capabilitiesObj?.ajax_security_mode;
            if (!cap) {
                throw new Error(`Device has no ajax_security_mode capability: ${deviceId}`);
            }
            return { value: cap.value ?? null, values: cap.values ?? [] };
        } catch (error) {
            homey.app.error('[AjaxSecurityMode] Error getting state:', error);
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
                capabilityId: 'ajax_security_mode',
                value: value
            });
            return true;
        } catch (error) {
            homey.app.error('[AjaxSecurityMode] Error setting state:', error);
            throw error;
        }
    }
};
