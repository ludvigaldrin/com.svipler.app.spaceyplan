module.exports = {
    id: 'speaker',

    // Get the current state
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            const playing = device.capabilitiesObj?.speaker_playing?.value ?? false;
            const volume = device.capabilitiesObj?.volume_set?.value ?? 0;
            const track = device.capabilitiesObj?.speaker_track?.value ?? null;
            const artist = device.capabilitiesObj?.speaker_artist?.value ?? null;

            return { playing, volume, track, artist };
        } catch (error) {
            homey.app.error('[Speaker] Error getting state:', error);
            throw error;
        }
    },

    // Set the state. `value` is a small action descriptor, since a speaker
    // bundles several distinct Homey capabilities behind one floor-plan
    // device: { action: 'playing', value: true }, { action: 'volume', value: 0.4 },
    // { action: 'next' } or { action: 'prev' }.
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            const action = value?.action;

            if (action === 'playing') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'speaker_playing',
                    value: value.value
                });
            } else if (action === 'volume') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'volume_set',
                    value: value.value
                });
            } else if (action === 'next') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'speaker_next',
                    value: true
                });
            } else if (action === 'prev') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'speaker_prev',
                    value: true
                });
            } else if (action === 'triggerFlow') {
                // Apps can't trigger an existing Flow directly (blocked by
                // Homey), so this fires our own Flow trigger card instead —
                // the user builds "WHEN this THEN ..." in their own Flow.
                await homey.app.triggerFlowButton(device.name);
            } else {
                throw new Error(`Unknown speaker action: ${action}`);
            }

            return true;
        } catch (error) {
            homey.app.error('[Speaker] Error setting state:', error);
            throw error;
        }
    }
};
