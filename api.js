'use strict';

module.exports = {
    // Log message
    async log({ homey, body }) {
        if (body && body.message) {
            homey.app.log(body.message);
            return { success: true };
        }
        return { success: false };
    },

    // Log error
    async error({ homey, body }) {
        if (body && body.message) {
            homey.app.error(body.message);
            return { success: true };
        }
        return { success: false };
    },

    // Get all devices
    async getDevices({ homey }) {
        return await homey.app.getDevices();
    },

    async getIconByName({ homey, params }) {
        try {
            const { iconName } = params;

            // Use Homey's built-in fetch to get the icon from my.homey.app
            // This avoids CORS issues since the request is made server-side
            const response = await fetch(`https://my.homey.app/img/devices/${iconName}.svg`);

            if (!response.ok) {
                throw new Error(`Failed to fetch icon: ${response.status}`);
            }

            // Get the SVG content
            const svgContent = await response.text();

            // Convert to base64
            const base64 = Buffer.from(svgContent).toString('base64');

            // Return as data URL
            return {
                dataUrl: `data:image/svg+xml;base64,${base64}`
            };
        } catch (error) {
            homey.app.error('Widget API - getIconByName error:', error);
            throw error;
        }
    }
} 