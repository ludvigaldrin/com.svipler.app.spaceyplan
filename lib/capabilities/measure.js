module.exports = {
    id: 'measure',

    // Get the current value
    async get({ homey, deviceId }) {
        try {
            // Handle combined temperature/humidity device
            if (deviceId.includes('-measure-combined')) {
                return await this.getCombinedValues(homey, deviceId);
            }

            // Extract the measure type from the device ID
            const measureTypeMatch = deviceId.match(/measure-(measure_[a-z_]+)$/);
            if (!measureTypeMatch) {
                throw new Error(`Invalid measure device ID format: ${deviceId}`);
            }

            const measureType = measureTypeMatch[1]; // e.g., measure_temperature or measure_humidity
            const homeyDeviceId = deviceId.replace(`-measure-${measureType}`, '');

            const device = await homey.app.getDevice(homeyDeviceId);
            if (!device) {
                throw new Error(`Device not found: ${homeyDeviceId}`);
            }

            // Get the value of the specific measure capability
            const value = device.capabilitiesObj?.[measureType]?.value;

            // Prepare result object
            const result = {
                value: value !== undefined ? value : null,
                measureType: measureType,
                unit: this.getUnit(measureType)
            };



            // Check if the device has both temperature and humidity capabilities
            // and provide the other value as a secondary reading if available
            if (measureType === 'measure_temperature' &&
                device.capabilitiesObj?.measure_humidity?.value !== undefined) {
                result.secondaryValue = device.capabilitiesObj.measure_humidity.value;
                result.secondaryType = 'measure_humidity';
                result.secondaryUnit = this.getUnit('measure_humidity');
            }
            else if (measureType === 'measure_humidity' &&
                device.capabilitiesObj?.measure_temperature?.value !== undefined) {
                result.secondaryValue = device.capabilitiesObj.measure_temperature.value;
                result.secondaryType = 'measure_temperature';
                result.secondaryUnit = this.getUnit('measure_temperature');
            }

            return result;

        } catch (error) {
            homey.app.error('[Measure] Error getting value:', error);
            throw error;
        }
    },

    // Get combined temperature and humidity values
    async getCombinedValues(homey, deviceId) {
        try {
            // Extract the base device ID from the combined ID
            const homeyDeviceId = deviceId.replace('-measure-combined', '');

            const device = await homey.app.getDevice(homeyDeviceId);
            if (!device) {
                throw new Error(`Device not found: ${homeyDeviceId}`);
            }

            const temperatureValue = device.capabilitiesObj?.measure_temperature?.value;
            const humidityValue = device.capabilitiesObj?.measure_humidity?.value;

            return {
                measureType: 'combined',
                temperature: {
                    value: temperatureValue !== undefined ? temperatureValue : null,
                    unit: this.getUnit('measure_temperature')
                },
                humidity: {
                    value: humidityValue !== undefined ? humidityValue : null,
                    unit: this.getUnit('measure_humidity')
                }
            };
        } catch (error) {
            homey.app.error('[Measure] Error getting combined values:', error);
            throw error;
        }
    },

    // Helper to get the appropriate unit for each measure type
    getUnit(measureType) {
        switch (measureType) {
            case 'measure_temperature':
                return '°C';
            case 'measure_humidity':
                return '%';
            default:
                return '';
        }
    },

    // Measures are read-only
    async set({ homey, deviceId, value }) {
        throw new Error('Measure capabilities are read-only');
    }
}; 