module.exports = {
    id: 'homealarmstate',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            const cap = device.capabilitiesObj?.homealarm_state;
            if (!cap) {
                throw new Error(`Device has no homealarm_state capability: ${deviceId}`);
            }
            return { value: cap.value ?? null, values: cap.values ?? [] };
        } catch (error) {
            homey.app.error('[HomeAlarmState] Error getting state:', error);
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
                capabilityId: 'homealarm_state',
                value: value
            });
            return true;
        } catch (error) {
            homey.app.error('[HomeAlarmState] Error setting state:', error);
            throw error;
        }
    }
};
