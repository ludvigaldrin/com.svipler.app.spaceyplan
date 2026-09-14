module.exports = {
    id: 'lawnmower',

    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            return {
                status: device.capabilitiesObj?.mower_status?.value ?? null,
                battery: device.capabilitiesObj?.measure_battery?.value ?? null,
                error: device.capabilitiesObj?.mower_error?.value ?? null,
                alarm: device.capabilitiesObj?.alarm_generic?.value ?? false
            };
        } catch (error) {
            homey.app.error('[Lawnmower] Error getting state:', error);
            throw error;
        }
    },

    // `value` is a small action descriptor: { action: 'start' | 'pause' |
    // 'resume' | 'stop' | 'dock' }, mapped to the corresponding cmd_*
    // button capability (all of which are momentary triggers — set to
    // true to fire them, mirroring how the native app/driver uses them).
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            const action = value?.action;
            const capabilityMap = {
                start: 'cmd_start_mowing',
                pause: 'cmd_pause',
                resume: 'cmd_resume',
                stop: 'cmd_stop',
                dock: 'cmd_dock',
                maintenance: 'cmd_maintenance_point'
            };
            const capabilityId = capabilityMap[action];
            if (!capabilityId) {
                throw new Error(`Unknown lawnmower action: ${action}`);
            }

            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: capabilityId,
                value: true
            });

            return true;
        } catch (error) {
            homey.app.error('[Lawnmower] Error setting state:', error);
            throw error;
        }
    }
};
