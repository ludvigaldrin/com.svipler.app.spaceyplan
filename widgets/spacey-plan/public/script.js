let Homey; // Store Homey instance
let currentDevices = [];
let rendererManager; // Add this at the top
let widgetId;

// Client-side image cache
const clientImageCache = {
    // Normalize URL to create a more consistent cache key
    normalizeUrl: function(url) {
        if (!url) return '';
        
        // For API image URLs, extract just the image ID
        if (url.includes('/api/image/')) {
            const parts = url.split('/api/image/');
            if (parts.length > 1) {
                return 'image-id-' + parts[1].split('?')[0]; // Remove any query params
            }
        }
        
        // For other URLs, keep the whole URL but remove any query params
        return url.split('?')[0];
    },
    
    // Use localStorage for persistence across app reloads (instead of sessionStorage)
    store: function(url, dataUrl) {
        try {
            // Store any valid URL in localStorage for persistence
            if (url) {
                const key = 'imgCache_' + this.normalizeUrl(url);
                localStorage.setItem(key, dataUrl);
                // After storing, output the entire cache
                this.outputCache();
            }
        } catch (e) {
            // Handle quota exceeded or other storage errors
            Homey.api('POST', '/error', { message: `Cache storage error: ${e.message}` });
        }
    },
    
    // Try to get an image from cache
    get: function(url) {
        if (!url) {
            Homey.api('POST', '/error', { message: `Cache get: Empty URL provided` });
            return null;
        }
        
        try {
            const normalizedUrl = this.normalizeUrl(url);
            const key = 'imgCache_' + normalizedUrl;
            
            const cached = localStorage.getItem(key);
            
            if (cached) {
              
                return cached;
            } 
            
            // For API image URLs, also try looking up by just the image ID
            if (url.includes('/api/image/') || url.includes('image-id-')) {
                let imageId;
                if (url.includes('/api/image/')) {
                    imageId = url.split('/api/image/')[1]?.split('?')[0];
                } else if (url.includes('image-id-')) {
                    imageId = url.replace('image-id-', '');
                }
                
                if (imageId) {
                    const altKey = 'imgCache_image-id-' + imageId;
                  
                    
                    const altCached = localStorage.getItem(altKey);
                    if (altCached) {
                        return altCached;
                    } 
                } 
            }
        } catch (e) {
            Homey.api('POST', '/error', { message: `Cache retrieval error: ${e.message}` });
        }
       
        return null;
    },
    
    // Clear all cached images
    clear: function() {
        try {
            // Remove all items that start with our prefix
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('imgCache_')) {
                    keysToRemove.push(key);
                }
            }
            
            // Remove the keys in a separate loop to avoid index issues
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
         
        } catch (e) {
            Homey.api('POST', '/error', { message: `Cache clear error: ${e.message}` });
        }
    },
    
    // Output all cache contents for debugging
    outputCache: function() {
        try {
            const cacheEntries = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('imgCache_')) {
                    // Only include the beginning of the data URL to avoid huge logs
                    const value = localStorage.getItem(key);
                    const truncatedValue = value.substring(0, 50) + '... [truncated]';
                    cacheEntries.push({ key, value: truncatedValue });
                }
            }
            
           
        } catch (e) {
            Homey.api('POST', '/error', { message: `Cache output error: ${e.message}` });
        }
    }
};

/** INIT */

async function onHomeyReady(_Homey) {
    Homey = _Homey;
    Homey.ready();

    // Initialize a global flag to track image loading
    window.floorImageLoaded = false;
    window.proxyImageJustLoaded = false;
    
    // Add a global helper function for capabilities to check if floor image is loaded
    window.isFloorImageLoaded = function() {
        const floorMapImage = document.getElementById('floorMapImage');
        return window.floorImageLoaded && 
               floorMapImage && 
               floorMapImage.complete && 
               floorMapImage.naturalWidth > 0;
    };
    
    // Add a global helper to wait for floor image to be loaded
    window.waitForFloorImage = function() {
        return new Promise((resolve) => {
            if (window.isFloorImageLoaded()) {
                resolve();
                return;
            }
            
            const checkInterval = setInterval(() => {
                if (window.isFloorImageLoaded()) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Also listen for the custom event
            document.addEventListener('floorImageReady', () => {
                clearInterval(checkInterval);
                resolve();
            }, { once: true });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(); // Resolve anyway to not block forever
            }, 5000);
        });
    };

    const settings = Homey.getSettings();
    const widgetHeight = settings.widgetHeight || 400; // fallback to 400 if not set

    await Homey.setHeight(widgetHeight);
    
    try {
        await init();
    } catch (error) {
        Homey.api('POST', '/error', { message: `Init error: ${JSON.stringify(error)}` });
        showErrorMessage(error.message);
    }
}

async function init() {
    // First Show Loading State
    showLoadingState();




    // Now load the widget
    widgetId = await Homey.getWidgetInstanceId();

    if (!widgetId) { // No widget ID available
        showErrorMessage("No widget ID available");
        return;
    }

    Homey.api('POST', '/log', { message: 'Init widget: ' + widgetId });
    // Get all floors
    const floors = await Homey.api('GET', '/floors');

    if (!floors || floors.length === 0) {
        showNoFloorsMessage();
        return;
    }

    // Get selected floor
    const selectedFloors = await Homey.api('GET', '/selectedFloors');
    const selectedFloor = selectedFloors[widgetId];

    if (selectedFloor && selectedFloor.floorId) {
        // Find the floor data
        const floor = floors.find(f => f.id === selectedFloor.floorId);
        if (floor) {
            await showSelectedFloor(floor);
        } else {
            showFloorSelector(floors);
        }
    } else {
        showFloorSelector(floors);
    }

    // Set up resize handler
    setupResizeHandler();
}
/** VIEWS */

async function showFloorSelector(floors) {
    const container = document.getElementById('floorSelector');

    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    floorGrid.className = 'floor-grid active';

    const html = `
        <div class="welcome-message">
            <h2>Welcome to Spacey Plan!</h2>
            <div class="floor-select-container">
                <select id="floorSelect" class="floor-select" >
                    <option value="">Choose a floor...</option>
                    ${floors.map(floor => `<option value="${floor.id}">${floor.name}</option>`).join('')}
                </select>
            </div>
            <button id="applyButton" class="homey-button-primary" disabled>
                Select Floor
            </button>
            <small style="color: #000; font-size: 8px;">Note! You cant be in Widget edit to select!</small>
        </div>
    `;

    floorGrid.innerHTML = html;


    const select = document.getElementById('floorSelect');
    const applyButton = document.getElementById('applyButton');

    select.addEventListener('change', async () => {
        const selectedId = select.value;
        applyButton.disabled = !selectedId;
    });

    applyButton.addEventListener('click', async () => {
        const selectedId = select.value;
        if (!selectedId) {
            return;
        }
        const selectedFloor = floors.find(f => f.id === selectedId);

        if (selectedFloor) {
            // Save the selected floor for this widget
            const result = await Homey.api('POST', '/selectedFloors', {
                widgetId: widgetId,
                floorId: selectedFloor.id
            });

            // We now have saved to lets select this floor now
            await showSelectedFloor(selectedFloor);
        }

    });

}

async function showSelectedFloor(floor) {
    // Initialize RendererManager with widgetId
    rendererManager = new CapabilityRendererManager();
    rendererManager.setWidgetId(widgetId);

    // Add a safety timeout to remove all spinners after 5 seconds
    setTimeout(removeAllSpinners, 5000);

    // Store the floor's aspect ratio for device positioning
    if (floor.imageAspectRatio) {
        rendererManager.setFloorAspectRatio(floor.imageAspectRatio);
    } else {
        Homey.api('POST', '/error', { message: '[FLOOR] Warning: No aspect ratio stored for floor' });
    }

    // Register renderers
    if (window.capabilityRenderers) {
        Object.values(window.capabilityRenderers).forEach(renderer => {
            rendererManager.registerRenderer(renderer);
        });
    }

    // Set up device update listener
    Homey.on(`widget:${widgetId}:deviceUpdate`, handleDeviceUpdate);

    const container = document.getElementById('floorSelector');
    if (container) {
        container.style.display = 'none';
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = `display: block;`;
    }

    // Create or update the image wrapper to maintain aspect ratio
    let imageWrapper = document.getElementById('imageWrapper');
    if (!imageWrapper) {
        imageWrapper = document.createElement('div');
        imageWrapper.id = 'imageWrapper';
        imageWrapper.className = 'image-wrapper';
        floorPlanContainer.appendChild(imageWrapper);
    }

    const floorMapImage = document.getElementById('floorMapImage') || document.createElement('img');
    floorMapImage.id = 'floorMapImage';
    floorMapImage.className = 'floor-map';
    
    // Hide image until loaded to prevent flickering
    floorMapImage.style.visibility = 'hidden';
    
    // Make sure the image wrapper exists before adding the loading class
    if (!floorMapImage.parentNode) {
        imageWrapper.appendChild(floorMapImage);
    }
    
    // Add loading indicator until image loads
    imageWrapper.classList.add('loading');
    imageWrapper.classList.remove('error');
    ensureSingleSpinner(); // Make sure we don't have multiple spinners
    let loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `<div class="spinner"></div>`;
    imageWrapper.appendChild(loadingIndicator);
    
    // Add event listeners for image loading
    floorMapImage.onload = () => {
        // Image has loaded successfully
        imageWrapper.classList.remove('loading');
        floorMapImage.style.visibility = 'visible';
        
        // Remove loading indicator when loaded
        const loadingIndicator = imageWrapper.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Set a flag that the image is loaded
        window.floorImageLoaded = true;

        
        // Important: Don't render devices here - use a separate call
        // to ensure the browser has fully rendered the image first
        setTimeout(() => {

            
            // Make sure we have the devices container
            let devContainer = document.getElementById('floorPlanDevices');
            if (!devContainer) {
                devContainer = document.createElement('div');
                devContainer.id = 'floorPlanDevices';
                imageWrapper.appendChild(devContainer);

            }
            
            // Important: Clear existing devices first
            devContainer.innerHTML = '';

            
            // Verify the floor data before rendering
            if (floor && floor.devices && floor.devices.length > 0) {

                
                // Render each device
                let renderedCount = 0;
                const renderPromises = floor.devices.map(device => {
                    try {
                        return rendererManager.renderDevice(device, devContainer)
                            .then(() => {
                                renderedCount++;

                            })
                            .catch(err => {
                                Homey.api('POST', '/error', { message: `DIRECT: Error rendering device ${device.name || device.id}: ${err.message}` });
                            });
                    } catch (err) {
                        Homey.api('POST', '/error', { message: `DIRECT: Exception rendering device ${device.name || device.id}: ${err.message}` });
                        return Promise.resolve(); // Continue with other devices
                    }
                });
                
                Promise.all(renderPromises)
                    .then(() => {

                        
                        // Dispatch an event for any other components
                        document.dispatchEvent(new CustomEvent('floorImageReady', {
                            detail: { 
                                imageWidth: floorMapImage.naturalWidth,
                                imageHeight: floorMapImage.naturalHeight,
                                aspectRatio: floorMapImage.naturalWidth / floorMapImage.naturalHeight
                            }
                        }));
                        
                        // Store the image in cache if needed
                        cacheFloorImageIfNeeded(floor, floorMapImage);
                    })
                    .catch(err => {
                        Homey.api('POST', '/error', { message: `DIRECT: Error in device rendering promises: ${err.message}` });
                    });
            }
        }, 10); // Minimal delay for cached images
    };
    
    // Handle image load errors
    floorMapImage.onerror = () => {
        // Clean up and hide the image
        imageWrapper.classList.remove('loading');
        floorMapImage.style.visibility = 'hidden';
        
        // Remove loading indicator
        const loadingIndicator = imageWrapper.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Log the error
        Homey.api('POST', '/error', { message: 'Failed to load floor image' });
        
        // Reset the image loaded flag
        window.floorImageLoaded = false;
        
        // Clear any corrupt cached version of this image
        if (imageSource) {
            try {
                const normalizedUrl = clientImageCache.normalizeUrl(imageSource);
                const key = 'imgCache_' + normalizedUrl;
                localStorage.removeItem(key);
                
                if (imageSource.includes('/api/image/')) {
                    const imageId = imageSource.split('/api/image/')[1]?.split('?')[0];
                    if (imageId) {
                        const altKey = 'imgCache_image-id-' + imageId;
                        localStorage.removeItem(altKey);
                    }
                }
            } catch (e) {
                Homey.api('POST', '/error', { message: `Cache removal error: ${e.message}` });
            }
        }
        
        // Just show error message instead of custom UI
        showErrorMessage("Failed to load floor image. Please try selecting a different floor.");
    };

    // Determine the best image source
    let imageSource = null;
    
    // 1. Use binary data if available (old style)
    if (floor.imageData) {
        imageSource = floor.imageData;
    } else if (floor.image) {
        imageSource = floor.image;
    } 
    // 2. Check if localStorage cache has the imageId
    else if (floor.imageId) {
        // Output all keys to see what we have
        try {
            const allKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                allKeys.push(localStorage.key(i));
            }

        } catch (e) {
            Homey.api('POST', '/error', { message: `Error listing keys: ${e.message}` });
        }
        
        const cachedImage = clientImageCache.get('image-id-' + floor.imageId);
        if (cachedImage) {
            imageSource = cachedImage;

        } else {

            // Check if we have any partial matches
            try {
                let hasPartialMatch = false;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.includes(floor.imageId)) {
                        hasPartialMatch = true;
                    }
                }
              
            } catch (e) {
                Homey.api('POST', '/error', { message: `Error checking partial matches: ${e.message}` });
            }
        }
    }
    
    // 3. If no cache exists, use localUrl with proxy
    if (!imageSource && floor.localUrl) {

        // For all URLs, use the proxy to convert to data URL
        const encodedUrl = encodeURIComponent(floor.localUrl);
        
        // Make sure the image wrapper shows loading indicator while proxy is working
        imageWrapper.classList.add('loading');
        floorMapImage.style.visibility = 'hidden';
        ensureSingleSpinner(); // Make sure we only have one spinner
        
        // Load via proxy
        Homey.api('GET', `/proxyImage?url=${encodedUrl}`)
            .then(result => {
                if (result && result.dataUrl) {
                    // Store in cache immediately after receiving
                    if (floor.imageId) {
                        clientImageCache.store('image-id-' + floor.imageId, result.dataUrl);
                    }
                    
                    // Clear any existing onload handler first
                    floorMapImage.onload = null;
                    
                    // Create a new onload handler specifically for proxy-loaded images
                    floorMapImage.onload = function() {
                        // Image has loaded successfully
                        imageWrapper.classList.remove('loading');
                        floorMapImage.style.visibility = 'visible';

                        
                        // Set a flag that the image is loaded
                        window.floorImageLoaded = true;

                        // Let the DOM render the image first, then render devices
                        setTimeout(() => {

                            
                            // Make sure we have the devices container
                            let devContainer = document.getElementById('floorPlanDevices');
                            if (!devContainer) {
                                devContainer = document.createElement('div');
                                devContainer.id = 'floorPlanDevices';
                                imageWrapper.appendChild(devContainer);
                            }
                            
                            // Important: Clear existing devices first
                            devContainer.innerHTML = '';
                            
                            // Verify the floor data before rendering
                            if (floor && floor.devices && floor.devices.length > 0) {
                                
                                // Render each device
                                let renderedCount = 0;
                                const renderPromises = floor.devices.map(device => {
                                    try {
                                        return rendererManager.renderDevice(device, devContainer)
                                            .then(() => {
                                                renderedCount++;

                                            })
                                            .catch(err => {
                                                Homey.api('POST', '/error', { message: `PROXY: Error rendering device ${device.name || device.id}: ${err.message}` });
                                            });
                                    } catch (err) {
                                        Homey.api('POST', '/error', { message: `PROXY: Exception rendering device ${device.name || device.id}: ${err.message}` });
                                        return Promise.resolve(); // Continue with other devices
                                    }
                                });
                                
                                Promise.all(renderPromises)
                                    .then(() => {

                                        // Dispatch an event for any other components
                                        document.dispatchEvent(new CustomEvent('floorImageReady', {
                                            detail: { 
                                                imageWidth: floorMapImage.naturalWidth,
                                                imageHeight: floorMapImage.naturalHeight,
                                                aspectRatio: floorMapImage.naturalWidth / floorMapImage.naturalHeight
                                            }
                                        }));
                                    })
                                    .catch(err => {
                                        Homey.api('POST', '/error', { message: `PROXY: Error in device rendering promises: ${err.message}` });
                                    });
                            } 
                        }, 250); // Longer delay to ensure the image is fully processed
                    };
                    
                    // Now set the src to start loading
                    floorMapImage.src = result.dataUrl;
                } else {
                    // 4. If we get error from localUrl use cloudUrl
                    tryCloudUrl();
                }
            })
            .catch(error => {
                Homey.api('POST', '/error', { message: `Proxy error: ${JSON.stringify(error)}` });
                // 4. If we get error from localUrl use cloudUrl
                tryCloudUrl();
            });
        
        // Return early since we're loading the image asynchronously
        return;
    }
    
    // 4. If no localUrl, try cloudUrl
    if (!imageSource && floor.cloudUrl) {
        tryCloudUrl();
        return;
    }
    
    function tryCloudUrl() {
        if (floor.cloudUrl) {

            // Make sure the image wrapper shows loading indicator while proxy is working
            imageWrapper.classList.add('loading');
            floorMapImage.style.visibility = 'hidden';
            
            // Add loading spinner if not already present
            ensureSingleSpinner(); // Remove any existing spinners first
            let loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.innerHTML = `<div class="spinner"></div>`;
            imageWrapper.appendChild(loadingIndicator);
            
            // Use the proxy for cloudUrl too
            const encodedUrl = encodeURIComponent(floor.cloudUrl);
            
            Homey.api('GET', `/proxyImage?url=${encodedUrl}`)
                .then(result => {
                    if (result && result.dataUrl) {
                        // Store in cache immediately after receiving
                        if (floor.imageId) {
                            clientImageCache.store('image-id-' + floor.imageId, result.dataUrl);
                        }
                        
                        // Clear any existing onload handler first
                        floorMapImage.onload = null;
                        
                        // Create a new onload handler specifically for proxy-loaded images
                        floorMapImage.onload = function() {
                            // Image has loaded successfully
                            imageWrapper.classList.remove('loading');
                            floorMapImage.style.visibility = 'visible';

                            
                            // Remove loading indicator when loaded
                            const loadingIndicator = imageWrapper.querySelector('.loading-indicator');
                            if (loadingIndicator) {
                                loadingIndicator.remove();
                            }
                            
                            // Set a flag that the image is loaded
                            window.floorImageLoaded = true;
                            

                            
                            // Let the DOM render the image first, then render devices
                            setTimeout(() => {

                                
                                // Make sure we have the devices container
                                let devContainer = document.getElementById('floorPlanDevices');
                                if (!devContainer) {
                                    devContainer = document.createElement('div');
                                    devContainer.id = 'floorPlanDevices';
                                    imageWrapper.appendChild(devContainer);

                                }
                                
                                // Important: Clear existing devices first
                                devContainer.innerHTML = '';

                                
                                // Verify the floor data before rendering
                                if (floor && floor.devices && floor.devices.length > 0) {

                                    
                                    // Render each device
                                    let renderedCount = 0;
                                    const renderPromises = floor.devices.map(device => {
                                        try {
                                            return rendererManager.renderDevice(device, devContainer)
                                                .then(() => {
                                                    renderedCount++;

                                                })
                                                .catch(err => {
                                                    Homey.api('POST', '/error', { message: `CLOUD PROXY: Error rendering device ${device.name || device.id}: ${err.message}` });
                                                });
                                        } catch (err) {
                                            Homey.api('POST', '/error', { message: `CLOUD PROXY: Exception rendering device ${device.name || device.id}: ${err.message}` });
                                            return Promise.resolve(); // Continue with other devices
                                        }
                                    });
                                    
                                    Promise.all(renderPromises)
                                        .then(() => {

                                            // Dispatch an event for any other components
                                            document.dispatchEvent(new CustomEvent('floorImageReady', {
                                                detail: { 
                                                    imageWidth: floorMapImage.naturalWidth,
                                                    imageHeight: floorMapImage.naturalHeight,
                                                    aspectRatio: floorMapImage.naturalWidth / floorMapImage.naturalHeight
                                                }
                                            }));
                                        })
                                        .catch(err => {
                                            Homey.api('POST', '/error', { message: `CLOUD PROXY: Error in device rendering promises: ${err.message}` });
                                        });
                                }
                            }, 250); // Longer delay to ensure the image is fully processed
                        };
                        
                        // Now set the src to start loading
                        floorMapImage.src = result.dataUrl;
                    } else {
                        showImageError();
                    }
                })
                .catch(error => {
                    Homey.api('POST', '/error', { message: `Cloud proxy error: ${JSON.stringify(error)}` });
                    showImageError();
                });
        } else {
            showImageError();
        }
    }
    
    function showImageError() {
        // Clean up and hide the image
        imageWrapper.classList.remove('loading');
        floorMapImage.style.visibility = 'hidden';
        
        // Remove loading indicator
        const loadingIndicator = imageWrapper.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        Homey.api('POST', '/error', { message: 'All image sources failed' });
        
        // Just show error message
        showErrorMessage("Could not load the floor plan image from any source. Please try a different floor.");
    }
    
    // Set the image source if we found one through direct data or cache
    if (imageSource) {
        floorMapImage.src = imageSource;
    } else if (!floor.localUrl && !floor.cloudUrl) {

        Homey.api('POST', '/error', { message: 'No image sources found for floor' });
        imageWrapper.classList.remove('loading');
        imageWrapper.classList.add('error');
        floorMapImage.style.visibility = 'hidden';
    }

    // Create or update the devices container
    let devicesContainer = document.getElementById('floorPlanDevices');
    if (!devicesContainer) {
        devicesContainer = document.createElement('div');
        devicesContainer.id = 'floorPlanDevices';
        imageWrapper.appendChild(devicesContainer);
    } else {
        devicesContainer.innerHTML = ''; // Clear existing devices
    }

    // Devices will be rendered in the onload event handler
    // This prevents issues with positioning when the image isn't loaded yet
    
    // Add settings button after floor plan is shown
    addSettingsButton();

    // Store current floor data
    window.getCurrentFloor = () => floor;
}

// Update the showLoadingState function to use our simpler spinner
function showLoadingState() {
    const container = document.getElementById('floorSelector');
    if (container) {
        container.className = 'floor-selector loading';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        ensureSingleSpinner(); // Make sure we have only one spinner
        floorGrid.innerHTML = `
            <div class="loading-indicator">
                <div class="spinner"></div>
            </div>
        `;
    }
}

function showNoFloorsMessage() {
    const container = document.getElementById('floorSelector');
    // Ensure blue background is shown
    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        floorGrid.innerHTML = `
            <div class="welcome-message error">
                <h2>No floor plans found!</h2>
                <p>Please add a floor plan in the app settings first.</p>
            </div>
        `;
    }
    
    // Always ensure settings button is visible with error state styling
    addSettingsButton(true);
}

function showErrorMessage(errorMessage) {
    const container = document.getElementById('floorSelector');
    // Ensure blue background is shown
    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        floorGrid.innerHTML = `
            <div class="welcome-message error">
                <h2>Something went wrong!</h2>
                <p>${errorMessage || 'Dunno but we cant go any further'}</p>
                <button id="retryButton" class="homey-button">Try Again</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryButton = document.getElementById('retryButton');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                // Show loading state again
                showLoadingState();
                // Retry initialization after a brief delay
                setTimeout(() => {
                    init().catch(err => {
                        showErrorMessage(err.message || 'Failed to initialize');
                    });
                }, 500);
            });
        }
    }
    
    // Always ensure settings button is visible with error state styling
    addSettingsButton(true);
}

/** HELPERS */
function addSettingsButton(isErrorState = false) {
    // Remove any existing settings button first
    const existingButton = document.querySelector('.settings-button');
    if (existingButton) {
        existingButton.remove();
    }

    const button = document.createElement('button');
    button.className = 'settings-button';
    
    // For error states, ensure high visibility with z-index and styling
    if (isErrorState) {
        button.style.cssText = `
            z-index: 10000; 
            position: absolute;
            right: 15px;
            top: 15px;
            background-color: rgba(255, 255, 255, 0.9);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;
    }
    
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    // Change the click handler to show the floor selector
    button.addEventListener('click', async () => {
        try {
            // Get all floors
            const floors = await Homey.api('GET', '/floors');

            if (!floors || floors.length === 0) {
                showNoFloorsMessage();
                return;
            }

            // Show the floor selector
            showFloorSelector(floors);
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error showing floor selector: ${JSON.stringify(error)}` });
            showErrorMessage("Failed to load floor selector");
        }
    });

    const container = document.querySelector('.widget-container');
    if (container) {
        container.appendChild(button);
    }
}

// Update device update handler with more logging
function handleDeviceUpdate(data) {
    const { deviceId, capability, value } = data;

    if (!rendererManager) {
        return;
    }

    // Find all elements for this device (could be both dim and onoff)
    const deviceElements = document.querySelectorAll(`[data-device-id="${deviceId}"]`);

    deviceElements.forEach(deviceEl => {
        const elementCapability = deviceEl.getAttribute('data-capability');

        const renderer = rendererManager.getRenderer(elementCapability);
        if (renderer && typeof renderer.handleDeviceUpdate === 'function') {
            renderer.handleDeviceUpdate(deviceEl, value, capability);
        }
    });
}

function renderDevicesOnFloor(floor) {
    if (!floor || !floor.devices || !floor.devices.length) {
        Homey.api('POST', '/error', { message: 'No devices to render on floor' });
        return;
    }

    // Clear existing devices
    const existingDevices = document.querySelectorAll('.device-element');
    existingDevices.forEach(device => device.remove());

    // First pass: create all device elements
    floor.devices.forEach(device => {
        if (!device || !device.homeyId) {
            Homey.api('POST', '/error', { message: 'Invalid device data: ' + JSON.stringify(device) });
            return;
        }

        try {
            const renderer = CapabilityRendererManager.getRendererForDevice(device);
            if (renderer) {
                renderer.createDeviceElement(device, floor.imageAspectRatio);
            } else {
                Homey.api('POST', '/error', { message: 'No renderer found for device: ' + device.name });
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: 'Error creating device element: ' + JSON.stringify(error) });
        }
    });

    // Second pass: initialize device states
    floor.devices.forEach(device => {
        if (!device || !device.homeyId) return;

        try {
            const renderer = CapabilityRendererManager.getRendererForDevice(device);
            if (renderer) {
                renderer.initializeState(device);
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: 'Error initializing device state: ' + JSON.stringify(error) });
        }
    });
}

// Add a window resize handler to recalculate device positions
function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce to avoid excessive recalculations
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const deviceElements = document.querySelectorAll('.device-element');
            const floorMapImage = document.querySelector('.floor-map');
            const wrapper = document.querySelector('.image-wrapper');

            if (!deviceElements.length || !floorMapImage || !wrapper) return;

            deviceElements.forEach(deviceEl => {
                try {
                    const deviceId = deviceEl.getAttribute('data-device-id');
                    if (!deviceId) return;

                    const device = JSON.parse(deviceEl.getAttribute('data-device') || '{}');
                    if (!device || !device.capability) return;

                    const renderer = CapabilityRendererManager.getRendererForCapability(device.capability);
                    if (!renderer) return;

                    // Trigger repositioning
                    renderer.positionDevice(deviceEl, device);
                } catch (error) {
                    Homey.api('POST', '/error', { message: 'Error repositioning device: ' + JSON.stringify(error) });
                }
            });
        }, 250); // Wait 250ms after resize ends
    });
}

// Re-render devices after the image has loaded to ensure correct positioning
async function renderDevicesAfterImageLoad(floor, devicesContainer) {
    // Make sure we have a valid container
    if (!devicesContainer) {
        devicesContainer = document.getElementById('floorPlanDevices');
        if (!devicesContainer) {
            Homey.api('POST', '/error', { message: 'No devices container found for rendering' });
            return;
        }
    }
    
    // Always clear existing devices
    devicesContainer.innerHTML = '';

    
    // Make sure we have devices to render
    if (!floor || !floor.devices || !floor.devices.length) {

        return;
    }
    
    // Re-render each device and catch errors to prevent one failure from blocking others
    let renderedCount = 0;
    for (const device of floor.devices) {
        try {
            await rendererManager.renderDevice(device, devicesContainer);
            renderedCount++;
        } catch (err) {
            Homey.api('POST', '/error', { message: `Error rendering device ${device.name || device.id}: ${err.message}` });
        }
    }

}

// Helper function to clear image cache (can be called from console for debugging)
function clearImageCache() {
    // Clear client-side cache
    clientImageCache.clear();
    
    // Clear server-side cache
    Homey.api('POST', '/clearImageCache')
        .then(result => {

        })
        .catch(error => {
            Homey.api('POST', '/error', { message: `Failed to clear server cache: ${JSON.stringify(error)}` });
        });
    
    return 'Image cache clear initiated';
}

// Helper function to cache a floor image if needed
function cacheFloorImageIfNeeded(floor, floorMapImage) {
    if (!floor || !floorMapImage || !floorMapImage.complete) {
        return;
    }
    
    try {
        // Only cache if we have a valid image and a place to store it
        if (floor.imageId && floorMapImage.src) {
            const cacheKey = 'image-id-' + floor.imageId;
            
            // Don't re-cache if already cached
            if (clientImageCache.get(cacheKey)) {

                return;
            }
            
            // Only cache if this is a real image (not a data URL that's already cached)
            if (floorMapImage.src.startsWith('data:') && floorMapImage.src.includes('imgCache_')) {
                return;
            }
            
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = floorMapImage.naturalWidth;
                canvas.height = floorMapImage.naturalHeight;
                ctx.drawImage(floorMapImage, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                
                // Store by image ID (most reliable)
                clientImageCache.store(cacheKey, dataUrl);

                
                // If we have URLs, also cache by them
                if (floor.localUrl) {
                    clientImageCache.store(floor.localUrl, dataUrl);
                }
                if (floor.cloudUrl) {
                    clientImageCache.store(floor.cloudUrl, dataUrl);
                }
            } catch (e) {
                Homey.api('POST', '/error', { message: `Failed to cache image: ${e.message}` });
            }
        }
    } catch (e) {
        // Non-critical error, just log it
        Homey.api('POST', '/error', { message: `Cache error (non-critical): ${e.message}` });
    }
}

// First, update the spinner CSS to be simpler and cleaner
const styleBlock = document.createElement('style');
styleBlock.textContent = `
    .loading-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(0, 118, 255, 0.2);
        border-radius: 50%;
        border-top-color: #0076ff;
        animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;

// Then, update the loading indicator creation to be simpler
// In showSelectedFloor function, where we add the spinner
let loadingIndicator = imageWrapper.querySelector('.loading-indicator');
if (!loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `<div class="spinner"></div>`;
    imageWrapper.appendChild(loadingIndicator);
}

// Also update in tryCloudUrl function
loadingIndicator = document.createElement('div');
loadingIndicator.className = 'loading-indicator';
loadingIndicator.innerHTML = `<div class="spinner"></div>`;
imageWrapper.appendChild(loadingIndicator);

// And finally in showLoadingState
floorGrid.innerHTML = `
    <div class="loading-indicator">
        <div class="spinner"></div>
    </div>
`;

// Add the style block to the document head
document.head.appendChild(styleBlock);

// Add a function to remove all spinners
function removeAllSpinners() {
    const spinners = document.querySelectorAll('.loading-indicator, .spinner');
    spinners.forEach(spinner => spinner.remove());
    
    const loadingElements = document.querySelectorAll('.loading');
    loadingElements.forEach(el => el.classList.remove('loading'));
    
    // Also make sure the floor image is visible if it exists
    const floorMapImage = document.getElementById('floorMapImage');
    if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
        floorMapImage.style.visibility = 'visible';
    }
}

// Add a global function to force reset and clear cache
window.forceReset = function() {
    // Clear cache
    clientImageCache.clear();
    
    // Try to clear server cache
    Homey.api('POST', '/clearImageCache').catch(() => {});
    
    // Remove all spinners
    removeAllSpinners();
    
    // Reload the app
    setTimeout(() => window.location.reload(), 500);
    
    return 'Clearing cache and reloading...';
};

// Also expose the clear cache function globally
window.clearImageCache = clearImageCache;

// Add this helper function for cleanup
function ensureSingleSpinner() {
    // First remove all existing spinners
    const existingSpinners = document.querySelectorAll('.loading-indicator');
    existingSpinners.forEach(spinner => spinner.remove());
}