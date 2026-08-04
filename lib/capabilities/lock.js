module.exports = {
    id: 'lock',

    // Get the current state
    // Returns an object so the widget also receives battery info for the badge
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            if (!device.capabilitiesObj?.locked) {
                throw new Error(`Device has no locked capability: ${deviceId}`);
            }

            return {
                locked: device.capabilitiesObj.locked.value ?? false,
                battery: device.capabilitiesObj?.measure_battery?.value ?? null
            };
        } catch (error) {
            homey.app.error('[Lock] Error getting state:', error);
            throw error;
        }
    },

    // Set the state (true = locked, false = unlocked)
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: 'locked',
                value: value
            });
            return true;
        } catch (error) {
            homey.app.error('[Lock] Error setting state:', error);
            throw error;
        }
    }
};
