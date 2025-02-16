module.exports = {
    id: 'onoff',
    
    // Get the current state
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            return device.capabilitiesObj?.onoff?.value ?? false;
        } catch (error) {
            homey.app.error('[OnOff] Error getting state:', error);
            throw error;
        }
    },
    
    // Set the state
    async set({ homey, deviceId, value }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            
            await homey.app.api.devices.setCapabilityValue({
                deviceId: deviceId,
                capabilityId: 'onoff',
                value: value
            });
            return true;
        } catch (error) {
            homey.app.error('[OnOff] Error setting state:', error);
            throw error;
        }
    }
}; 