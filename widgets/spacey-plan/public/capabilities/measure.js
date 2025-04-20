const measureRenderer = {
    id: 'measure',

    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = this.id + '-device';

        deviceEl.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 28px;
            height: 28px;
            cursor: pointer;
            z-index: 300;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            opacity: 0;
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 8px 1px rgba(255, 255, 255, 0.45);
        `;

        // Add a clickable overlay that extends beyond the visible icon for easier tapping
        const clickableOverlay = document.createElement('div');
        clickableOverlay.className = 'clickable-overlay';
        clickableOverlay.style.cssText = `
            position: absolute;
            width: 70px;
            height: 70px;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 299;
            cursor: pointer;
            background-color: rgba(255, 255, 255, 0.01);
        `;
        deviceEl.appendChild(clickableOverlay);

        // Add device icon styles if not already present
        if (!document.getElementById('deviceIconStyles')) {
            const styles = document.createElement('style');
            styles.id = 'deviceIconStyles';
            styles.textContent = `
                .device-icon {
                    max-width: 14.4px;
                    max-height: 14.4px;
                    width: auto;
                    height: auto;
                }
                .icon-wrapper .material-symbols-outlined {
                    font-size: 18px; /* 10% smaller than before */
                }
            `;
            document.head.appendChild(styles);
        }

        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-homey-id', device.homeyId);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        // Store which measure capabilities this device supports
        if (device.measureCapabilities) {
            deviceEl.setAttribute('data-measure-capabilities', JSON.stringify(device.measureCapabilities));
        }

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'icon-wrapper';

        // Add icon if available
        if (device.iconObj) {
            const img = document.createElement('img');
            // Use base64 data if available, otherwise fall back to URL
            if (device.iconObj.base64) {
                img.src = device.iconObj.base64;
            } else if (device.iconObj.url) {
                img.src = device.iconObj.url;
            }
            img.className = 'device-icon';
            iconWrapper.appendChild(img);
        }

        deviceEl.appendChild(iconWrapper);

        const positionDevice = () => {
            return new Promise((resolve) => {
                const floorMapImage = document.getElementById('floorMapImage');
                const wrapper = document.getElementById('imageWrapper');

                const setPosition = () => {
                    if (!floorMapImage || !wrapper) return;
                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return;

                    const wrapperRect = wrapper.getBoundingClientRect();
                    const currentImageAspectRatio = floorMapImage.naturalWidth / floorMapImage.naturalHeight;
                    const storedAspectRatio = device.floorAspectRatio || parseFloat(deviceEl.getAttribute('data-floor-aspect-ratio'));
                    
                    let displayX, displayY;
                    
                    if (storedAspectRatio) {
                        // Calculate the actual displayed image dimensions
                        let imageWidth, imageHeight;
                        
                        // If the image is constrained by height (taller than wide relative to container)
                        if (wrapperRect.width / wrapperRect.height > currentImageAspectRatio) {
                            imageHeight = wrapperRect.height;
                            imageWidth = imageHeight * currentImageAspectRatio;
                        } else {
                            // Image is constrained by width
                            imageWidth = wrapperRect.width;
                            imageHeight = imageWidth / currentImageAspectRatio;
                        }
                        
                        // Calculate the position based on the original aspect ratio
                        displayX = (position.x / 100) * imageWidth;
                        displayY = (position.y / 100) * imageHeight;
                        
                        // If the image doesn't fill the wrapper, add offsets to center it
                        if (imageWidth < wrapperRect.width) {
                            displayX += (wrapperRect.width - imageWidth) / 2;
                        }
                        if (imageHeight < wrapperRect.height) {
                            displayY += (wrapperRect.height - imageHeight) / 2;
                        }
                    } else {
                        // Fallback to the original calculation if no aspect ratio is stored
                        displayX = (position.x / 100) * wrapperRect.width;
                        displayY = (position.y / 100) * wrapperRect.height;
                    }
                    
                    deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
                    deviceEl.style.opacity = '1';
                    resolve();
                };

                if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                    setPosition();
                } else if (floorMapImage) {
                    floorMapImage.onload = setPosition;
                }

                const retryInterval = setInterval(() => {
                    if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                        setPosition();
                        clearInterval(retryInterval);
                    }
                }, 100);

                setTimeout(() => clearInterval(retryInterval), 5000);
            });
        };

        // Execute positioning
        positionDevice().catch(() => {
            Homey.api('POST', '/error', { message: 'Error positioning device' });
        });

        // Apply initial rules
        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            // Get the device data
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            const measureCapabilities = deviceData.measureCapabilities || [];
            
            // Store measurement values
            deviceEl.setAttribute('data-temperature', '');
            deviceEl.setAttribute('data-humidity', '');
            
            // Subscribe to the device's measure capabilities
            const subscribeDevices = [];
            
            // Fetch initial values for each capability
            for (const capability of measureCapabilities) {
                try {
                    const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/${capability}`);
                    if (response !== undefined) {
                        if (capability === 'measure_temperature') {
                            deviceEl.setAttribute('data-temperature', response);
                        } else if (capability === 'measure_humidity') {
                            deviceEl.setAttribute('data-humidity', response);
                        }
                    }
                    
                    // Add to subscription list
                    subscribeDevices.push({ deviceId, capability });
                } catch (error) {
                    Homey.api('POST', '/error', { message: `Error fetching ${capability}: ${JSON.stringify(error)}` });
                }
            }
            
            // Subscribe to updates for all capabilities
            if (subscribeDevices.length > 0) {
                await Homey.api('POST', `/subscribeToDevices`, {
                    widgetId: widgetId,
                    devices: subscribeDevices
                });
            }

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in initializeState: ${JSON.stringify(error)}` });
        }
    },

    initializeInteractions(deviceEl) {
        // Check if deviceEl is a valid DOM element
        if (!deviceEl || !deviceEl.addEventListener) {
            Homey.api('POST', '/error', { message: 'Invalid device element provided to initializeInteractions' });
            return;
        }

        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        const TOUCH_TOLERANCE = 15; // Pixels of movement allowed before considering it a drag

        // Function to handle touch start for both the device element and overlay
        const handleTouchStart = (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;
            
            // Store initial touch position
            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }

            // Add visual feedback
            deviceEl.style.transform = this.addScaleTransform(deviceEl, 1.2);
            deviceEl.style.opacity = '0.8';

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    // Reset visual feedback before showing modal
                    deviceEl.style.transform = this.removeScaleTransform(deviceEl);
                    deviceEl.style.opacity = '1';
                    this.showDeviceModal(deviceEl);
                }
            }, 500);
        };

        // Function to handle touch move for both the device element and overlay
        const handleTouchMove = (e) => {
            e.stopPropagation();
            
            // Check if movement exceeds tolerance
            if (e.touches && e.touches[0]) {
                const diffX = Math.abs(e.touches[0].clientX - touchStartX);
                const diffY = Math.abs(e.touches[0].clientY - touchStartY);
                
                // Only consider it moved if it exceeds our tolerance
                if (diffX > TOUCH_TOLERANCE || diffY > TOUCH_TOLERANCE) {
                    touchMoved = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
            }
        };

        // Function to handle touch end for both the device element and overlay
        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Reset visual feedback
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
            deviceEl.style.opacity = '1';

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Short tap shows modal for measure devices
            if (!touchMoved && (Date.now() - touchStartTime < 500)) {
                this.showDeviceModal(deviceEl);
            }
            
            touchMoved = false;
        };

        // Function to handle click for both the device element and overlay
        const handleClick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            // Show modal on click for measure devices
            this.handleClick(deviceEl);
        };

        // Add event listeners to the device element
        deviceEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        deviceEl.addEventListener('touchmove', handleTouchMove);
        deviceEl.addEventListener('touchend', handleTouchEnd, { passive: false });
        deviceEl.addEventListener('click', handleClick, { passive: false });

        // Add event listeners to the clickable overlay
        const overlay = deviceEl.querySelector('.clickable-overlay');
        if (overlay) {
            overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
            overlay.addEventListener('touchmove', handleTouchMove);
            overlay.addEventListener('touchend', handleTouchEnd, { passive: false });
            overlay.addEventListener('click', handleClick, { passive: false });
        }
    },

    async handleClick(deviceEl) {
        // For measure devices, show modal on click
        this.showDeviceModal(deviceEl);
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            // Update the appropriate value based on capability
            if (capability === 'measure_temperature') {
                deviceEl.setAttribute('data-temperature', value);
            } else if (capability === 'measure_humidity') {
                deviceEl.setAttribute('data-humidity', value);
            }

            // Update modal if it exists
            const deviceId = deviceEl.getAttribute('data-device-id');
            const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
            if (modal) {
                if (capability === 'measure_temperature') {
                    const tempValue = modal.querySelector('.temperature-value');
                    if (tempValue) {
                        tempValue.textContent = `${parseFloat(value).toFixed(1)}°C`;
                    }
                } else if (capability === 'measure_humidity') {
                    const humidityValue = modal.querySelector('.humidity-value');
                    if (humidityValue) {
                        humidityValue.textContent = `${parseFloat(value).toFixed(0)}%`;
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');

            // Reset cloud effect first
            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            // Check for allIcon rule first
            const allIconRule = device.rules?.find(r => r.type === 'allIcon');
            if (allIconRule?.config?.selectedIcon) {
                // Clear existing icon wrapper content
                if (iconWrapper) {
                    iconWrapper.innerHTML = '';

                    // Add material icon
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined';
                    iconSpan.textContent = allIconRule.config.selectedIcon;
                    iconWrapper.appendChild(iconSpan);

                    // Make sure icon wrapper is visible
                    iconWrapper.style.display = 'flex';
                    
                    // Apply consistent sizing
                    iconSpan.style.fontSize = '18px'; // 10% smaller than before
                }
            }

            // Check allColor first - if it exists, only apply allColor and ignore all others
            const allColorRule = device.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-all-color', allColorRule.config.cloudColor || allColorRule.config.mainColor);

                // Handle cloud effect with intense values
                if (allColorRule.config.showCloud) {
                    const color = allColorRule.config.cloudColor || allColorRule.config.mainColor;
                    // Device background cloud
                    deviceEl.style.backgroundColor = `${color}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${color}90`;

                    // Icon wrapper cloud
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${color}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${color}E0`;
                    }
                }

                // Handle icon visibility and color
                if (iconWrapper) {
                    if (!allColorRule.config.showIcon) {
                        iconWrapper.style.display = 'none';
                    } else {
                        iconWrapper.style.display = 'flex';
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && allColorRule.config.iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${allColorRule.config.iconColor})`;
                            } else {
                                iconElement.style.color = allColorRule.config.iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${allColorRule.config.iconColor})`;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in applyInitialRules: ${JSON.stringify(error)}` });
        }
    },

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const temperature = deviceEl.getAttribute('data-temperature');
        const humidity = deviceEl.getAttribute('data-humidity');
        
        // Parse measure capabilities
        const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
        const measureCapabilities = deviceData.measureCapabilities || [];
        
        const hasTemperature = measureCapabilities.includes('measure_temperature');
        const hasHumidity = measureCapabilities.includes('measure_humidity');

        const overlay = document.createElement('div');
        overlay.className = 'device-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        // Create buttons for each available capability
        const viewButtons = [];
        const viewSections = [];
        
        if (hasTemperature) {
            viewButtons.push(`<button class="view-button active" data-view="temperature">Temperature</button>`);
            viewSections.push(`
                <div class="dim-view temperature-view active">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">device_thermostat</span>
                        <div class="temperature-value">${temperature ? `${parseFloat(temperature).toFixed(1)}°C` : 'N/A'}</div>
                    </div>
                </div>
            `);
        }
        
        if (hasHumidity) {
            viewButtons.push(`<button class="view-button ${!hasTemperature ? 'active' : ''}" data-view="humidity">Humidity</button>`);
            viewSections.push(`
                <div class="dim-view humidity-view ${!hasTemperature ? 'active' : ''}">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">humidity_percentage</span>
                        <div class="humidity-value">${humidity ? `${parseFloat(humidity).toFixed(0)}%` : 'N/A'}</div>
                    </div>
                </div>
            `);
        }

        const modal = document.createElement('div');
        modal.className = 'device-modal measure-modal';
        modal.setAttribute('data-device-id', deviceId);
        modal.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            ${viewButtons.length > 1 ? `
                <div class="dim-view-toggle">
                    ${viewButtons.join('')}
                </div>
            ` : ''}
            <div class="dim-views">
                ${viewSections.join('')}
            </div>
        `;

        // Add styles if not present
        if (!document.getElementById('measureModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'measureModalStyles';
            styles.textContent = `
                .device-modal {
                    background: rgba(245, 245, 245, 0.95);
                    border-radius: 15px;
                    padding: 16px;
                    width: 260px;
                    max-width: 90vw;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }

                .measure-modal {
                    min-height: 180px;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(0,0,0,0.1);
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 18px;
                    color: #333;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 200px;
                }

                .close-button {
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #333;
                    cursor: pointer;
                    padding: 5px;
                }

                .dim-view-toggle {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin-bottom: 16px;
                    padding: 4px;
                    background: rgba(0,0,0,0.05);
                    border-radius: 20px;
                }

                .view-button {
                    padding: 8px 16px;
                    border: none;
                    background: none;
                    color: #1C1C1E;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-weight: bold;
                    flex: 1;
                    text-align: center;
                }

                .view-button.active {
                    background: #1C1C1E;
                    color: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                .dim-view {
                    display: none;
                }

                .dim-view.active {
                    display: block;
                }

                .measure-display {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    background: rgba(255,255,255,0.4);
                    border-radius: 12px;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.05);
                    min-height: 100px;
                }

                .measure-display .material-symbols-outlined {
                    font-size: 48px;
                    margin-bottom: 12px;
                    color: #0076ff;
                }

                .temperature-value, .humidity-value {
                    font-size: 32px;
                    font-weight: bold;
                    color: #1C1C1E;
                }
            `;
            document.head.appendChild(styles);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close modal when clicking outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Add close button handler
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });

        // Add tab switching functionality if we have multiple capabilities
        if (viewButtons.length > 1) {
            const tabButtons = modal.querySelectorAll('.view-button');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Deactivate all buttons and views
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    modal.querySelectorAll('.dim-view').forEach(view => view.classList.remove('active'));
                    
                    // Activate the clicked button and corresponding view
                    button.classList.add('active');
                    const viewName = button.getAttribute('data-view');
                    modal.querySelector(`.${viewName}-view`).classList.add('active');
                });
            });
        }
    },

    setupExternalUpdates() {
        if (!window.Homey) {
            Homey.api('POST', '/error', { message: 'No Homey object available' });
            return;
        }

        // Remove any existing listeners first
        window.Homey.removeAllListeners('realtime/device');

        window.Homey.on('realtime/device', (data) => {
            if (data && (data.capability === 'measure_temperature' || data.capability === 'measure_humidity')) {
                const deviceElements = document.querySelectorAll(`[data-device-id="${data.id}"]`);
                deviceElements.forEach(deviceEl => {
                    this.handleDeviceUpdate(deviceEl, data.value, data.capability);
                });
            }
        });
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Helper function to add scale transform without affecting position
    addScaleTransform(element, scale) {
        const currentTransform = element.style.transform;
        // Check if there's already a scale transform
        if (currentTransform.includes('scale(')) {
            // Replace existing scale
            return currentTransform.replace(/scale\([^)]+\)/, `scale(${scale})`);
        } else {
            // Add new scale
            return `${currentTransform} scale(${scale})`;
        }
    },

    // Helper function to remove scale transform without affecting position
    removeScaleTransform(element) {
        const currentTransform = element.style.transform;
        // Remove scale transform if it exists
        return currentTransform.replace(/\s*scale\([^)]+\)/, '');
    }
}


window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.measure = measureRenderer;

measureRenderer.setupExternalUpdates();
