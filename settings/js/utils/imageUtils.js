/**
 * Image utility functions for handling image processing in the app
 */
const imageUtils = {
    /**
     * Process an image for use in the app
     * - Resizes the image to reasonable dimensions
     * - Compresses the image data 
     * - Detects transparency and chooses appropriate format
     * - Returns the processed image data and aspect ratio
     * 
     * @param {File} file - The image file to process
     * @returns {Promise<Object>} - Object containing imageData and aspectRatio
     */
    processImage: function(file) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const img = new Image();
                    
                    img.onload = () => {
                        try {
                            // Create canvas for image processing
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            // Reduce dimensions for compression
                            const MAX_WIDTH = 500;
                            const MAX_HEIGHT = 800;
                            
                            // Calculate dimensions
                            let { width, height } = img;
                            const scaleWidth = MAX_WIDTH / width;
                            const scaleHeight = MAX_HEIGHT / height;
                            const scale = Math.min(1, scaleWidth, scaleHeight);
                            
                            width = Math.floor(width * scale);
                            height = Math.floor(height * scale);
                            
                            // Set canvas size
                            canvas.width = width;
                            canvas.height = height;
                            
                            // Draw image with smoothing
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            ctx.clearRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            // Determine if the image has transparency
                            let hasTransparency = this.checkForTransparency(file, ctx, width, height);
                            
                            // Use appropriate format based on transparency
                            let processedImageData;
                            if (hasTransparency) {
                                // Use PNG for images with transparency
                                processedImageData = canvas.toDataURL('image/png', 0.7);
                            } else {
                                // Use JPEG for images without transparency (better compression)
                                processedImageData = canvas.toDataURL('image/jpeg', 0.8);
                            }
                            
                            // Return the processed image data and aspect ratio
                            resolve({
                                imageData: processedImageData,
                                aspectRatio: img.naturalWidth / img.naturalHeight
                            });
                        } catch (err) {
                            window.logError('[PROCESS IMAGE] Failed to process image:', err);
                            reject(err);
                        }
                    };
                    
                    img.onerror = (err) => {
                        window.logError('[PROCESS IMAGE] Failed to load image:', err);
                        reject(new Error('Failed to load image'));
                    };
                    
                    img.src = e.target.result;
                };
                
                reader.onerror = (err) => {
                    window.logError('[PROCESS IMAGE] Failed to read file:', err);
                    reject(new Error('Failed to read file'));
                };
                
                reader.readAsDataURL(file);
            } catch (err) {
                window.logError('[PROCESS IMAGE] Exception in processImage:', err);
                reject(err);
            }
        });
    },
    
    /**
     * Check if an image has transparency
     * 
     * @param {File} file - The original file (for type checking)
     * @param {CanvasRenderingContext2D} ctx - Canvas context with the image drawn
     * @param {number} width - Width of the canvas
     * @param {number} height - Height of the canvas
     * @returns {boolean} - True if the image has transparency
     */
    checkForTransparency: function(file, ctx, width, height) {
        // Check file type first
        const fileType = file.type.toLowerCase();
        if (fileType === 'image/png' || fileType === 'image/webp' || fileType === 'image/gif') {
            // These formats support transparency, so we'll check for it
            // Get image data to check for transparency
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Check if any pixel has alpha < 255 (not fully opaque)
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] < 255) {
                    return true;
                }
            }
        }
        
        return false;
    }
};

// Export for global access
window.imageUtils = imageUtils; 