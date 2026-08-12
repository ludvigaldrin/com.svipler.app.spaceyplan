module.exports = {
    id: 'thermostat',

    // Get the current setpoint (target_temperature)
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            if (!device.capabilitiesObj?.target_temperature) {
                throw new Error(`Device has no target_temperature capability: ${deviceId}`);
            }

            return {
                value: device.capabilitiesObj.target_temperature.value ?? null
            };
        } catch (error) {
            homey.app.error('[Thermostat] Error getting state:', error);
            throw error;
        }
    },

    // Set the setpoint. Range/step are fixed at 5-30°C in 0.5°C steps
    // (standard radiator thermostat range) rather than read per-device,
    // so clamp/round defensively here in case a stray value slips through.
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            let target = Number(value);
            target = Math.max(5, Math.min(30, target));
            target = Math.round(target * 2) / 2;

            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: 'target_temperature',
                value: target
            });
            return true;
        } catch (error) {
            homey.app.error('[Thermostat] Error setting state:', error);
            throw error;
        }
    }
};
