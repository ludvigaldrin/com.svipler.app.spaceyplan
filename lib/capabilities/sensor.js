module.exports = {
    id: 'sensor',
    
    // Get the current state
    async get({ homey, deviceId }) {
        try {
            const device = await homey.app.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            
            // Check for either alarm_contact or alarm_motion capability
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