module.exports = {
    id: 'windowcovering',

    // Get the current position (0 = closed, 1 = fully open)
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            if (!device.capabilitiesObj?.windowcoverings_set) {
                throw new Error(`Device has no windowcoverings_set capability: ${deviceId}`);
            }

            return {
                position: device.capabilitiesObj.windowcoverings_set.value ?? 0
            };
        } catch (error) {
            homey.app.error('[Windowcovering] Error getting state:', error);
            throw error;
        }
    },

    // Set the position (0 = closed, 1 = fully open). `value` is normally a
    // plain number, but can also be an action descriptor
    // { action: 'triggerFlow' } to fire the Flow-button trigger card,
    // matching the pattern used by the speaker capability.
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            if (value && typeof value === 'object' && value.action === 'triggerFlow') {
                // Apps can't trigger an existing Flow directly (blocked by
                // Homey), so this fires our own Flow trigger card instead —
                // the user builds "WHEN this THEN ..." in their own Flow.
                await homey.app.triggerFlowButton(device.name);
                return true;
            }

            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: 'windowcoverings_set',
                value: value
            });
            return true;
        } catch (error) {
            homey.app.error('[Windowcovering] Error setting state:', error);
            throw error;
        }
    }
};
