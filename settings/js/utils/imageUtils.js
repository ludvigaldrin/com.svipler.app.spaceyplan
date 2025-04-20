/**
 * Image utility functions for handling image processing in the app
 */
const imageUtils = {
    // Maximum image size in bytes (lowering to 0.75MB to be safe)
    MAX_FILE_SIZE: 0.75 * 1024 * 1024,
    
    // Absolute maximum size in bytes (1.5MB - hard limit)
    ABSOLUTE_MAX_SIZE: 1.5 * 1024 * 1024,

    /**
     * Process an image for use in the app with adaptive compression
     * First tries with minimal processing, then gradually increases
     * compression until the image is small enough to use
     * 
     * @param {File} file - The image file to process
     * @param {Object} [options] - Optional compression options
     * @param {number} [options.quality] - Quality factor (0-1)
     * @param {number} [options.maxDimension] - Maximum dimension for width/height
     * @returns {Promise<Object>} - Object containing imageData and aspectRatio
     */
    processImage: function(file, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // Check file size first to avoid unnecessary processing
                if (file.size > 10 * 1024 * 1024) {
                    // If file is larger than 10MB, reject immediately
                    reject(new Error(`Image is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Please select an image smaller than 10MB.`));
                    return;
                }
                
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const img = new Image();
                    
                    img.onload = async () => {
                        try {
                            // Get original aspect ratio
                            const aspectRatio = img.naturalWidth / img.naturalHeight;
                            
                            // Check dimensions to avoid extremely large images
                            if (img.naturalWidth > 4000 || img.naturalHeight > 4000) {
                                window.logError('[PROCESS IMAGE] Image dimensions too large:', 
                                    `${img.naturalWidth}x${img.naturalHeight}`);
                                console.warn(`Image dimensions are very large: ${img.naturalWidth}x${img.naturalHeight}. This may cause performance issues.`);
                            }
                            
                            let result;
                            
                            // If specific options were provided, use those
                            if (options.quality || options.maxDimension) {
                                const maxWidth = options.maxDimension || 1500;
                                const maxHeight = options.maxDimension || 1500;
                                const quality = options.quality || 0.9;
                                
                                // Use specified compression settings
                                const hasTransparency = this.checkFileTypeForTransparency(file);
                                result = await this.compressImage(img, maxWidth, maxHeight, quality, hasTransparency);
                            } else {
                                // Use adaptive compression
                                result = await this.tryCompressWithMultipleLevels(img, file);
                            }
                            
                            // Final size check
                            const finalSize = this.estimateBase64Size(result);
                            if (finalSize > this.ABSOLUTE_MAX_SIZE) {
                                reject(new Error(`Unable to compress image to a reasonable size. Current size: ${(finalSize / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${(this.ABSOLUTE_MAX_SIZE / 1024 / 1024).toFixed(2)}MB.`));
                                return;
                            }
                            
                            // Return the processed image data and aspect ratio
                            resolve({
                                imageData: result,
                                aspectRatio: aspectRatio,
                                size: finalSize
                            });
                        } catch (err) {
                            window.logError('[PROCESS IMAGE] Failed to process image:', err);
                            reject(err);
                        }
                    };
                    
                    img.onerror = (err) => {
                        window.logError('[PROCESS IMAGE] Failed to load image:', err);
                        reject(new Error('Failed to load image. The image format may be unsupported or the file may be corrupted.'));
                    };
                    
                    img.src = e.target.result;
                };
                
                reader.onerror = (err) => {
                    window.logError('[PROCESS IMAGE] Failed to read file:', err);
                    reject(new Error('Failed to read image file.'));
                };
                
                reader.readAsDataURL(file);
            } catch (err) {
                window.logError('[PROCESS IMAGE] Exception in processImage:', err);
                reject(err);
            }
        });
    },
    
    /**
     * Try multiple levels of compression until successful
     * 
     * @param {HTMLImageElement} img - The image to compress
     * @param {File} file - The original file
     * @returns {Promise<string>} - The processed image data as a data URL
     */
    tryCompressWithMultipleLevels: async function(img, file) {
        // Define compression levels, from least to most aggressive
        const compressionLevels = [
            { maxWidth: 1500, maxHeight: 1500, quality: 0.9 },    // Medium-large with light compression
            { maxWidth: 1200, maxHeight: 1200, quality: 0.85 },   // Medium with light compression
            { maxWidth: 1000, maxHeight: 1000, quality: 0.8 },    // Medium with moderate compression
            { maxWidth: 800, maxHeight: 800, quality: 0.75 },     // Medium-small with moderate compression
            { maxWidth: 600, maxHeight: 600, quality: 0.7 },      // Small with moderate compression
            { maxWidth: 500, maxHeight: 500, quality: 0.6 },      // Small with higher compression
            { maxWidth: 400, maxHeight: 400, quality: 0.5 },      // Very small with high compression
            { maxWidth: 300, maxHeight: 300, quality: 0.4 }       // Extremely small with very high compression
        ];
        
        // Check if the image has transparency
        const hasTransparency = this.checkFileTypeForTransparency(file);
        
        // Try each compression level until we get one small enough
        for (const level of compressionLevels) {
            try {
                const result = await this.compressImage(img, level.maxWidth, level.maxHeight, level.quality, hasTransparency);
                
                // Check if result is small enough
                const estimatedSize = this.estimateBase64Size(result);
                console.log(`Compression level: ${level.maxWidth}x${level.maxHeight}, Quality: ${level.quality}, Size: ~${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
                
                if (estimatedSize < this.MAX_FILE_SIZE) {
                    return result;
                }
            } catch (err) {
                window.logError(`[COMPRESSION] Failed at level ${level.maxWidth}x${level.maxHeight}:`, err);
                // Continue to next level if this one fails
            }
        }
        
        // If we get here, try one final extreme compression attempt
        try {
            // Force JPEG format for non-transparent images
            const format = hasTransparency ? 'image/png' : 'image/jpeg';
            const finalLevel = {
                maxWidth: 250,
                maxHeight: 250,
                quality: 0.3
            };
            
            const result = await this.compressImage(
                img,
                finalLevel.maxWidth,
                finalLevel.maxHeight,
                finalLevel.quality,
                hasTransparency,
                format
            );
            
            const estimatedSize = this.estimateBase64Size(result);
            console.log(`FINAL compression attempt: ${finalLevel.maxWidth}x${finalLevel.maxHeight}, Quality: ${finalLevel.quality}, Size: ~${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
            
            return result;
        } catch (err) {
            window.logError('[COMPRESSION] Final compression attempt failed:', err);
            throw new Error('Failed to compress image to acceptable size. Please try a smaller image.');
        }
    },

    /**
     * Compress an image with the given parameters
     * 
     * @param {HTMLImageElement} img - The image to compress
     * @param {number} maxWidth - Maximum width
     * @param {number} maxHeight - Maximum height
     * @param {number} quality - Quality factor (0-1)
     * @param {boolean} hasTransparency - Whether the image has transparency
     * @param {string} [forcedFormat] - Optional format to force regardless of transparency
     * @returns {Promise<string>} - The processed image data as a data URL
     */
    compressImage: function(img, maxWidth, maxHeight, quality, hasTransparency, forcedFormat) {
        return new Promise((resolve, reject) => {
            try {
                // Create canvas for image processing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate dimensions
                let { width, height } = img;
                
                // Skip resizing if dimensions are already smaller than max
                if (width > maxWidth || height > maxHeight) {
                    const scaleWidth = maxWidth / width;
                    const scaleHeight = maxHeight / height;
                    const scale = Math.min(1, scaleWidth, scaleHeight);
                    
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);
                }
                
                // Set canvas size
                canvas.width = width;
                canvas.height = height;
                
                // Draw image with smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                // Check if the image has transparency from pixel data
                let confirmTransparency = false;
                if (hasTransparency) {
                    confirmTransparency = this.checkCanvasForTransparency(ctx, width, height);
                }
                
                // Use appropriate format based on transparency
                let processedImageData;
                if (forcedFormat) {
                    // Use forced format if specified
                    processedImageData = canvas.toDataURL(forcedFormat, quality);
                } else if (hasTransparency && confirmTransparency) {
                    // Use PNG for images with transparency
                    processedImageData = canvas.toDataURL('image/png', quality);
                } else {
                    // Use JPEG for images without transparency (better compression)
                    processedImageData = canvas.toDataURL('image/jpeg', quality);
                }
                
                resolve(processedImageData);
            } catch (err) {
                reject(err);
            }
        });
    },
    
    /**
     * Check file type to see if it potentially has transparency
     * 
     * @param {File} file - The file to check
     * @returns {boolean} - True if the file type supports transparency
     */
    checkFileTypeForTransparency: function(file) {
        const fileType = file.type.toLowerCase();
        return fileType === 'image/png' || fileType === 'image/webp' || fileType === 'image/gif';
    },
    
    /**
     * Check if the canvas contains transparent pixels
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @returns {boolean} - True if the canvas has transparent pixels
     */
    checkCanvasForTransparency: function(ctx, width, height) {
        try {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Only sample a subset of pixels for large images
            const stride = Math.max(1, Math.floor(data.length / 4 / 10000));
            
            // Check if any pixel has alpha < 255 (not fully opaque)
            for (let i = 3; i < data.length; i += 4 * stride) {
                if (data[i] < 255) {
                    return true;
                }
            }
            
            return false;
        } catch (err) {
            // If there's an error checking transparency, assume no transparency
            window.logError('[CHECK TRANSPARENCY] Error checking canvas transparency:', err);
            return false;
        }
    },
    
    /**
     * Estimate the size of a base64 string in bytes
     * 
     * @param {string} base64String - The base64 data URL
     * @returns {number} - Estimated size in bytes
     */
    estimateBase64Size: function(base64String) {
        // Remove the data URL prefix
        const base64Data = base64String.split(',')[1];
        if (!base64Data) return 0;
        
        // Calculate size: base64 represents 6 bits per character,
        // so 4 characters in base64 represent 3 bytes of data
        return Math.ceil(base64Data.length * 0.75);
    },
    
    /**
     * Verifies if the image data size is acceptable before saving
     * 
     * @param {string} imageData - The base64 image data
     * @returns {boolean} - True if the image size is acceptable
     */
    verifyImageSize: function(imageData) {
        const size = this.estimateBase64Size(imageData);
        return size <= this.ABSOLUTE_MAX_SIZE;
    }
};

// Export for global access
window.imageUtils = imageUtils; 