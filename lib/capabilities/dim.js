module.exports = {
    id: 'dim',
    
    // Get the current state
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            
            // Get both dim and onoff states
            const dimValue = device.capabilitiesObj?.dim?.value ?? 0;
            const onoffValue = device.capabilitiesObj?.onoff?.value ?? false;
            
            return {
                dim: dimValue,
                onoff: onoffValue
            };
        } catch (error) {
            homey.app.error('[Dim] Error getting state:', error);
            throw error;
        }
    },
    
    // Set the state
    async set({ homey, deviceId, value, capability = 'dim' }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            
            // Handle both dim and onoff capabilities
            if (capability === 'dim') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'dim',
                    value: value
                });
                
                // If dim value is 0, turn off the device
                // If dim value > 0, ensure device is on
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'onoff',
                    value: value > 0
                });
            } else if (capability === 'onoff') {
                await homey.app.api.devices.setCapabilityValue({
                    deviceId: deviceId,
                    capabilityId: 'onoff',
                    value: value
                });
                
                // If turning off, keep dim value in memory but set device to 0
                // If turning on, restore last dim value or set to 1
                if (value) {
                    const currentDim = device.capabilitiesObj?.dim?.value ?? 1;
                    await homey.app.api.devices.setCapabilityValue({
                        deviceId: deviceId,
                        capabilityId: 'dim',
                        value: currentDim > 0 ? currentDim : 1
                    });
                }
            }
            
            return true;
        } catch (error) {
            homey.app.error('[Dim] Error setting state:', error);
            throw error;
        }
    }
}; 