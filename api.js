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
    },
    
    // Upload a new floor image
    async uploadFloorImage({ homey, body }) {
        try {
            
            if (!body || !body.imageData) {
                return { 
                    success: false,
                    error: 'No image data provided' 
                };
            }
            
            // Decode base64 data from the request
            const base64Data = body.imageData.split(';base64,').pop();
            const imageBuffer = Buffer.from(base64Data, 'base64');
            

            
            try {
                // Get the Images API
                const image = await homey.images.createImage();
                homey.app.log('Image created with ID:', image.id);
                
                // Set the stream handler according to SDK documentation
                const { Readable } = require('stream');
                image.setStream((targetStream) => {
                    
                    // Create a stream from our buffer
                    const sourceStream = new Readable();
                    sourceStream._read = () => {}; // Required for older Node versions
                    
                    // Push our image data and end the stream
                    sourceStream.push(imageBuffer);
                    sourceStream.push(null); // Signal end of stream
                    
                    // Pipe our data to the target stream
                    return sourceStream.pipe(targetStream);
                });
                

                
                // Get the image URL - use cloudUrl and localUrl properties
                const cloudUrl = image.cloudUrl;
                const localUrl = image.localUrl;
                
                
                // We can just return the ID, as the client can construct URLs using it
                homey.app.log('Successfully processed image with ID:', image.id);
                
                // Include URLs in the response for easier client-side use
                return {
                    success: true,
                    imageId: image.id,
                    cloudUrl: image.cloudUrl,
                    localUrl: image.localUrl
                };
            } catch (imageError) {
                homey.app.error('Homey Images API error:', imageError);
                return {
                    success: false,
                    error: `Homey Images API error: ${imageError.message || 'Unknown error'}`
                };
            }
        } catch (error) {
            homey.app.error('API - uploadFloorImage error:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred during image upload'
            };
        }
    },
    
    // Update an existing floor image
    async updateFloorImage({ homey, body }) {
        try {

            if (!body || !body.imageData) {
                return { 
                    success: false,
                    error: 'No image data provided' 
                };
            }
            
            if (!body.imageId) {
                return { 
                    success: false,
                    error: 'No image ID provided' 
                };
            }
            
            // Decode base64 data from the request
            const base64Data = body.imageData.split(';base64,').pop();
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            try {
                let image;
                
                // Try to get existing image or create new one
                try {
                    image = await homey.images.getImage({ id: body.imageId });
                } catch (getImageError) {
                    homey.app.error('Could not find existing image, creating new one:', getImageError);
                    image = await homey.images.createImage();
                }
                
                // Set the stream handler according to SDK documentation
                const { Readable } = require('stream');
                image.setStream((targetStream) => {
                    
                    // Create a stream from our buffer
                    const sourceStream = new Readable();
                    sourceStream._read = () => {}; // Required for older Node versions
                    
                    // Push our image data and end the stream
                    sourceStream.push(imageBuffer);
                    sourceStream.push(null); // Signal end of stream
                    
                    // Pipe our data to the target stream
                    return sourceStream.pipe(targetStream);
                });

                // If this was an existing image, call update
                if (body.imageId) {
                    await image.update();

                }
                
                // Get the image URL - use cloudUrl and localUrl properties
                const cloudUrl = image.cloudUrl;
                const localUrl = image.localUrl;
                
                homey.app.log('Updated image URLs:', { cloudUrl, localUrl });

                
                // Include URLs in the response for easier client-side use
                return {
                    success: true,
                    imageId: image.id,
                    cloudUrl: image.cloudUrl,
                    localUrl: image.localUrl
                };
            } catch (imageError) {
                homey.app.error('Homey Images API error during update:', imageError);
                return {
                    success: false,
                    error: `Homey Images API error: ${imageError.message || 'Unknown error'}`
                };
            }
        } catch (error) {
            homey.app.error('API - updateFloorImage error:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred during image update'
            };
        }
    }
} 