module.exports = {
    id: 'sensor',

    // Get the current state
    async get({ homey, deviceId }) {
        try {
            // New format: <homeyDeviceId>-sensor-<alarm_type>
            // This makes the alarm type explicit and supports devices
            // with multiple alarm capabilities (e.g. smoke + tamper)
            const match = deviceId.match(/^(.*)-sensor-(alarm_[a-z0-9_]+)$/);
            if (match) {
                const homeyDeviceId = match[1];
                const alarmType = match[2];

                const device = await homey.app.getDevice(homeyDeviceId);
                if (!device) {
                    throw new Error(`Device not found: ${homeyDeviceId}`);
                }

                return device.capabilitiesObj?.[alarmType]?.value ?? false;
            }

            // Legacy format: plain device id, check contact then motion
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            if (device.capabilitiesObj?.alarm_contact) {
                return device.capabilitiesObj.alarm_contact.value ?? false;
            } else if (device.capabilitiesObj?.alarm_motion) {
                return device.capabilitiesObj.alarm_motion.value ?? false;
            }

            return false;
        } catch (error) {
            homey.app.error('[Sensor] Error getting state:', error);
            throw error;
        }
    },

    // Set state is not needed for sensors as they are read-only
    async set({ homey, deviceId, value }) {
        throw new Error('Sensors are read-only');
    }
};
