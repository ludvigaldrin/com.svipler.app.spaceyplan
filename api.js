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
    
    // Upload a new floor image to userdata folder
    async uploadFloorImage({ homey, body }) {
        try {
            homey.app.log('UPLOAD: Starting image upload process');
            
            if (!body || !body.imageData) {
                homey.app.error('UPLOAD: No image data provided in request body');
                return { 
                    success: false,
                    error: 'No image data provided' 
                };
            }
            
            homey.app.log('UPLOAD: Image data received, size:', body.imageData.length);
            
            // Decode base64 data from the request
            const base64Data = body.imageData.split(';base64,').pop();
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            homey.app.log('UPLOAD: Decoded base64 data, buffer size:', imageBuffer.length);
            
            try {
                // Create unique filename using UUID pattern
                const uuid = require('crypto').randomUUID ? 
                    require('crypto').randomUUID() : 
                    Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15);
                
                homey.app.log('UPLOAD: Generated UUID:', uuid);
                
                // Determine file extension based on image format
                let fileExtension = 'jpg'; // Default to jpg
                if (body.imageData.includes('data:image/png')) {
                    fileExtension = 'png';
                } else if (body.imageData.includes('data:image/gif')) {
                    fileExtension = 'gif';
                } else if (body.imageData.includes('data:image/webp')) {
                    fileExtension = 'webp';
                }
                
                homey.app.log('UPLOAD: Determined file extension:', fileExtension);
                
                // Create filename
                const filename = `${uuid}.${fileExtension}`;
                homey.app.log('UPLOAD: Final filename:', filename);
                
                // Get path to userdata directory
                const fs = require('fs');
                const path = require('path');
                
                // Get the userdata path from the app
                const userdataDir = homey.app.getUserDataPath();
                homey.app.log('UPLOAD: Using userdata directory:', userdataDir);
                
                // Check if directory exists and is writeable
                try {
                    const stats = fs.statSync(userdataDir);
                    homey.app.log('UPLOAD: Userdata directory exists:', stats.isDirectory());
                    
                    // Check if writeable by attempting to create a test file
                    const testPath = path.join(userdataDir, `.test-write-access`);
                    fs.writeFileSync(testPath, 'test', { flag: 'w' });
                    fs.unlinkSync(testPath); // Delete the test file
                    homey.app.log('UPLOAD: Userdata directory is writeable');
                } catch (dirError) {
                    homey.app.error('UPLOAD: Error accessing userdata directory:', dirError);
                    return {
                        success: false,
                        error: `Userdata directory error: ${dirError.message}`
                    };
                }
                
                // Full path to save the file
                const filePath = path.join(userdataDir, filename);
                homey.app.log('UPLOAD: Will save to path:', filePath);
                
                // Write the file
                try {
                    fs.writeFileSync(filePath, imageBuffer);
                    homey.app.log('UPLOAD: File successfully written to disk');
                } catch (writeError) {
                    homey.app.error('UPLOAD: Error writing file:', writeError);
                    return {
                        success: false,
                        error: `File write error: ${writeError.message}`
                    };
                }
                
                // Check if the file exists now
                if (fs.existsSync(filePath)) {
                    homey.app.log('UPLOAD: Verified file exists after writing');
                    const fileStats = fs.statSync(filePath);
                    homey.app.log('UPLOAD: File size on disk:', fileStats.size);
                } else {
                    homey.app.error('UPLOAD: File does not exist after writing!');
                }
                
                // Construct URLs for the file
                const imageId = filename;
                const appId = homey.manifest.id;
                
                // The URL to access the image from the Homey app
                const fileUrl = `/app/${appId}/userdata/${filename}`;
                homey.app.log('UPLOAD: Generated fileUrl:', fileUrl);
                
                return {
                    success: true,
                    imageId: imageId,
                    fileUrl: fileUrl
                };
            } catch (fileError) {
                homey.app.error('UPLOAD: File system error:', fileError);
                return {
                    success: false,
                    error: `File system error: ${fileError.message || 'Unknown error'}`
                };
            }
        } catch (error) {
            homey.app.error('UPLOAD: General error in uploadFloorImage:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred during image upload'
            };
        }
    },
    
    // Update an existing floor image in userdata folder
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
                // Get file system modules
                const fs = require('fs');
                const path = require('path');
                
                // Get userdata directory - use the correct path for Homey
                const userdataDir = '/userdata';
                
                // If updating existing image, try to get the original filename
                let filename = body.imageId;
                
                // Check if we're looking at an old Homey Images API ID or a filename
                if (!filename.includes('.')) {
                    // Create a new file since this is likely an old image ID format
                    const uuid = require('crypto').randomUUID ? 
                        require('crypto').randomUUID() : 
                        Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15);
                    
                    // Determine file extension based on image format
                    let fileExtension = 'jpg'; // Default to jpg
                    if (body.imageData.includes('data:image/png')) {
                        fileExtension = 'png';
                    } else if (body.imageData.includes('data:image/gif')) {
                        fileExtension = 'gif';
                    } else if (body.imageData.includes('data:image/webp')) {
                        fileExtension = 'webp';
                    }
                    
                    filename = `${uuid}.${fileExtension}`;
                }
                
                // Full path to save the file
                const filePath = path.join(userdataDir, filename);
                
                // Write the file, overwriting if it exists
                fs.writeFileSync(filePath, imageBuffer);
                
                homey.app.log('Successfully updated image in userdata:', filename);
                
                // Construct URLs for the file
                const imageId = filename;
                const appId = homey.manifest.id;
                
                // The URL to access the image from the Homey app
                const fileUrl = `/app/${appId}/userdata/${filename}`;
                
                return {
                    success: true,
                    imageId: imageId,
                    fileUrl: fileUrl
                };
            } catch (fileError) {
                homey.app.error('File system error during update:', fileError);
                return {
                    success: false,
                    error: `File system error: ${fileError.message || 'Unknown error'}`
                };
            }
        } catch (error) {
            homey.app.error('API - updateFloorImage error:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred during image update'
            };
        }
    },
    
    // Get a floor image by ID
    async getFloorImageById({ homey, params, query }) {
        try {
            homey.app.log('GET IMAGE: Starting image retrieval process');
            
            if (!params || !params.imageId) {
                homey.app.error('GET IMAGE: Missing imageId parameter');
                throw new Error('Missing imageId parameter');
            }
            
            homey.app.log('GET IMAGE: Requested imageId:', params.imageId);
            
            // Check if the client wants raw binary data instead of base64
            const returnRaw = query && query.raw === 'true';
            homey.app.log('GET IMAGE: Raw binary mode:', returnRaw);
            
            // Get path to userdata directory
            const fs = require('fs');
            const path = require('path');
            
            // Get the userdata path from the app
            const userdataDir = homey.app.getUserDataPath();
            homey.app.log('GET IMAGE: Using userdata directory:', userdataDir);
            
            // Check if directory exists
            try {
                if (fs.existsSync(userdataDir)) {
                    const stats = fs.statSync(userdataDir);
                    homey.app.log('GET IMAGE: Userdata directory exists:', stats.isDirectory());
                } else {
                    homey.app.error('GET IMAGE: Userdata directory does not exist');
                    throw new Error('Userdata directory does not exist');
                }
            } catch (dirError) {
                homey.app.error('GET IMAGE: Error checking userdata directory:', dirError);
                throw new Error(`Error checking userdata directory: ${dirError.message}`);
            }
            
            // Full path to the image file
            const filePath = path.join(userdataDir, params.imageId);
            homey.app.log('GET IMAGE: Full file path:', filePath);
            
            // Check if file exists
            try {
                if (fs.existsSync(filePath)) {
                    homey.app.log('GET IMAGE: File exists');
                    const stats = fs.statSync(filePath);
                    homey.app.log('GET IMAGE: File size:', stats.size);
                } else {
                    homey.app.error('GET IMAGE: File does not exist at path');
                    throw new Error('Image file not found');
                }
            } catch (fileError) {
                homey.app.error('GET IMAGE: Error checking file exists:', fileError);
                throw new Error(`Error checking file: ${fileError.message}`);
            }
            
            // Read file
            let imageBuffer;
            try {
                imageBuffer = fs.readFileSync(filePath);
                homey.app.log('GET IMAGE: File read successfully, buffer size:', imageBuffer.length);
            } catch (readError) {
                homey.app.error('GET IMAGE: Error reading file:', readError);
                throw new Error(`Error reading file: ${readError.message}`);
            }
            
            // Determine content type based on extension
            const fileExtension = path.extname(filePath).toLowerCase();
            let contentType = 'image/jpeg'; // Default
            
            if (fileExtension === '.png') {
                contentType = 'image/png';
            } else if (fileExtension === '.gif') {
                contentType = 'image/gif';
            } else if (fileExtension === '.webp') {
                contentType = 'image/webp';
            }
            
            homey.app.log('GET IMAGE: Content type:', contentType);
            
            // If raw binary data is requested, return it with the content type
            if (returnRaw) {
                homey.app.log('GET IMAGE: Returning raw binary data');
                return {
                    headers: {
                        'Content-Type': contentType
                    },
                    body: imageBuffer
                };
            }
            
            // Otherwise convert to base64
            try {
                const base64 = imageBuffer.toString('base64');
                homey.app.log('GET IMAGE: Converted to base64, length:', base64.length);
                
                const dataURL = `data:${contentType};base64,${base64}`;
                homey.app.log('GET IMAGE: Created data URL successfully');
                
                return {
                    success: true,
                    imageData: dataURL,
                    dataUrl: dataURL  // Include both for backward compatibility
                };
            } catch (base64Error) {
                homey.app.error('GET IMAGE: Error converting to base64:', base64Error);
                throw new Error(`Error creating base64: ${base64Error.message}`);
            }
        } catch (error) {
            homey.app.error('GET IMAGE: General error in getFloorImageById:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred getting image'
            };
        }
    },

    // Delete a floor image
    async deleteFloorImage({ homey, params }) {
        try {
            homey.app.log('DELETE IMAGE: Starting deletion process');
            
            if (!params || !params.imageId) {
                homey.app.error('DELETE IMAGE: Missing imageId parameter');
                throw new Error('Missing imageId parameter');
            }
            
            const imageId = params.imageId;
            homey.app.log('DELETE IMAGE: Image to delete:', imageId);
            
            const fs = require('fs');
            const path = require('path');
            
            // Get the userdata path from the app
            const userdataDir = homey.app.getUserDataPath();
            homey.app.log('DELETE IMAGE: Using userdata directory:', userdataDir);
            
            // Check if directory exists and is writable
            try {
                if (fs.existsSync(userdataDir)) {
                    homey.app.log('DELETE IMAGE: Userdata directory exists');
                    
                    try {
                        fs.accessSync(userdataDir, fs.constants.W_OK);
                        homey.app.log('DELETE IMAGE: Userdata directory is writable');
                    } catch (accessError) {
                        homey.app.error('DELETE IMAGE: Userdata directory is not writable:', accessError);
                        throw new Error('Userdata directory is not writable');
                    }
                } else {
                    homey.app.error('DELETE IMAGE: Userdata directory does not exist');
                    throw new Error('Userdata directory does not exist');
                }
            } catch (dirError) {
                homey.app.error('DELETE IMAGE: Error checking userdata directory:', dirError);
                throw new Error(`Error checking userdata directory: ${dirError.message}`);
            }
            
            // Construct file path
            const filePath = path.join(userdataDir, imageId);
            homey.app.log('DELETE IMAGE: Full file path:', filePath);
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                homey.app.error('DELETE IMAGE: File does not exist at path:', filePath);
                return {
                    success: false,
                    error: 'Image file not found'
                };
            }
            
            // Delete the file
            try {
                fs.unlinkSync(filePath);
                homey.app.log('DELETE IMAGE: Successfully deleted file');
                return {
                    success: true
                };
            } catch (deleteError) {
                homey.app.error('DELETE IMAGE: Error deleting file:', deleteError);
                throw new Error(`Error deleting file: ${deleteError.message}`);
            }
        } catch (error) {
            homey.app.error('DELETE IMAGE: General error in deleteFloorImage:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred deleting image'
            };
        }
    },
    
    // Save a floor image
    async saveFloorImage({ homey, params, body }) {
        try {
            homey.app.log('SAVE IMAGE: Starting save process');
            
            if (!body || !body.imageData) {
                homey.app.error('SAVE IMAGE: Missing imageData in request body');
                throw new Error('Missing imageData in request body');
            }
            
            // Extract image details from data URL
            const imageDataMatches = body.imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
            if (!imageDataMatches) {
                homey.app.error('SAVE IMAGE: Invalid image data format. Expected data URL.');
                throw new Error('Invalid image data format. Expected data URL.');
            }
            
            const imageType = imageDataMatches[1].toLowerCase();
            const base64Data = imageDataMatches[2];
            
            // Validate supported image type
            const supportedTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
            if (!supportedTypes.includes(imageType)) {
                homey.app.error('SAVE IMAGE: Unsupported image type:', imageType);
                throw new Error(`Unsupported image type: ${imageType}. Supported types: ${supportedTypes.join(', ')}`);
            }
            
            const fs = require('fs');
            const path = require('path');
            const crypto = require('crypto');
            
            // Generate a unique filename with timestamp and random hash
            const timestamp = Date.now();
            const randomHash = crypto.randomBytes(8).toString('hex');
            const imageExtension = imageType === 'jpeg' ? 'jpg' : imageType;
            const imageId = `floor_${timestamp}_${randomHash}.${imageExtension}`;
            
            homey.app.log('SAVE IMAGE: Generated image ID:', imageId);
            
            // Get the userdata path from the app
            const userdataDir = homey.app.getUserDataPath();
            homey.app.log('SAVE IMAGE: Using userdata directory:', userdataDir);
            
            // Check if directory exists and is writable, create if needed
            try {
                if (!fs.existsSync(userdataDir)) {
                    homey.app.log('SAVE IMAGE: Userdata directory does not exist, creating it');
                    fs.mkdirSync(userdataDir, { recursive: true });
                }
                
                try {
                    fs.accessSync(userdataDir, fs.constants.W_OK);
                    homey.app.log('SAVE IMAGE: Userdata directory is writable');
                } catch (accessError) {
                    homey.app.error('SAVE IMAGE: Userdata directory is not writable:', accessError);
                    throw new Error('Userdata directory is not writable');
                }
            } catch (dirError) {
                homey.app.error('SAVE IMAGE: Error checking/creating userdata directory:', dirError);
                throw new Error(`Error with userdata directory: ${dirError.message}`);
            }
            
            // Construct file path
            const filePath = path.join(userdataDir, imageId);
            homey.app.log('SAVE IMAGE: Full file path:', filePath);
            
            // Convert base64 to buffer and save file
            try {
                const imageBuffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filePath, imageBuffer);
                homey.app.log('SAVE IMAGE: Successfully saved image file');
                
                return {
                    success: true,
                    imageId: imageId
                };
            } catch (saveError) {
                homey.app.error('SAVE IMAGE: Error saving image file:', saveError);
                throw new Error(`Error saving image file: ${saveError.message}`);
            }
        } catch (error) {
            homey.app.error('SAVE IMAGE: General error in saveFloorImage:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred saving image'
            };
        }
    }
} 