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
            z-index: 300;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            opacity: 0;
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 8px 1px rgba(255, 255, 255, 0.45);
            pointer-events: none;
        `;

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

        if (device.measureType && device.measureType === 'combined'){
            device.measureCapabilities = device.measureTypes;
        } else if (device.measureType){
            device.measureCapabilities = [device.measureType];
        }

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
            img.style.pointerEvents = 'auto';
            img.style.cursor = 'pointer';
            img.style.userSelect = 'none';
            img.style.webkitUserSelect = 'none';
            img.style.webkitTouchCallout = 'none';
            
            // Defensive check before appendChild
            if (iconWrapper && img) {
                iconWrapper.appendChild(img);
            }
        }

        // Add value display with circle background
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'value-display';
        valueDisplay.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: white;
            border: 2px solid #333;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
            font-weight: bold;
            color: #333;
            z-index: 302;
        `;

        const value = device.measure !== undefined ? device.measure : 0;
        valueDisplay.textContent = `${Math.round(value)}`;
        
        // Defensive check before appendChild  
        if (iconWrapper && valueDisplay) {
            iconWrapper.appendChild(valueDisplay);
        }

        // Defensive check before appendChild
        if (deviceEl && iconWrapper) {
            deviceEl.appendChild(iconWrapper);
        }

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

            // Initialize measureCapabilities from various sources
            let measureCapabilities = [];

            // First try deviceData.measureCapabilities
            if (deviceData.measureCapabilities && Array.isArray(deviceData.measureCapabilities)) {
                measureCapabilities = deviceData.measureCapabilities;
            }
            // Then try deviceData.measureTypes (specific to this API)
            else if (deviceData.measureTypes && Array.isArray(deviceData.measureTypes)) {
                measureCapabilities = deviceData.measureTypes;
            }
            // Then try deviceData.capabilities (from Homey)
            else if (deviceData.capabilities && Array.isArray(deviceData.capabilities)) {
                // Filter only measure_temperature and measure_humidity
                measureCapabilities = deviceData.capabilities.filter(cap =>
                    cap === 'measure_temperature' || cap === 'measure_humidity'
                );
            }

            // If still empty, try to fetch capabilities from Homey API
            if (measureCapabilities.length === 0) {
                try {
                    // Use Homey API to get device capabilities
                    const device = await Homey.api('GET', `/devices/${deviceId}`);
                    if (device && device.capabilities && Array.isArray(device.capabilities)) {
                        measureCapabilities = device.capabilities.filter(cap =>
                            cap === 'measure_temperature' || cap === 'measure_humidity'
                        );
                    }
                } catch (err) {
                    Homey.api('POST', '/error', { message: `Error fetching device capabilities: ${err.message}` });
                }
            }

            // Store updated measureCapabilities back to the element
            deviceData.measureCapabilities = measureCapabilities;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));
            deviceEl.setAttribute('data-measure-capabilities', JSON.stringify(measureCapabilities));

            // Store measurement values
            deviceEl.setAttribute('data-temperature', '');
            deviceEl.setAttribute('data-humidity', '');

            // Determine if we need to fetch individual capabilities or use combined
            const hasTemperature = measureCapabilities.includes('measure_temperature');
            const hasHumidity = measureCapabilities.includes('measure_humidity');
            const hasBoth = hasTemperature && hasHumidity;

            // Use the correct device ID format for the 'measure' capability
            let subscribeDevices = [];
            let tempValue, humidityValue;

            try {
                if (hasBoth && deviceData.measureType === 'combined') {
                    // For combined capability, use the combined format
                    const combinedDeviceId = `${deviceId}-measure-combined`;

                    // Fetch combined values
                    const response = await Homey.api('GET', `/devices/${combinedDeviceId}/capabilities/measure`);

                    if (response) {
                        if (response.temperature && response.temperature.value !== undefined) {
                            tempValue = response.temperature.value;
                            deviceEl.setAttribute('data-temperature', tempValue);
                        }

                        if (response.humidity && response.humidity.value !== undefined) {
                            humidityValue = response.humidity.value;
                            deviceEl.setAttribute('data-humidity', humidityValue);
                        }
                    }

                    // Subscribe to combined updates
                    subscribeDevices.push({ deviceId: combinedDeviceId, capability: 'measure' });
                } else {
                    // Handle individual capabilities
                    if (hasTemperature) {
                        const tempDeviceId = `${deviceId}-measure-measure_temperature`;

                        const response = await Homey.api('GET', `/devices/${tempDeviceId}/capabilities/measure`);
                        if (response && response.value !== undefined) {
                            tempValue = response.value;
                            deviceEl.setAttribute('data-temperature', tempValue);
                        }

                        // Subscribe to temperature updates
                        subscribeDevices.push({ deviceId: tempDeviceId, capability: 'measure' });
                    }

                    if (hasHumidity) {
                        const humidityDeviceId = `${deviceId}-measure-measure_humidity`;

                        const response = await Homey.api('GET', `/devices/${humidityDeviceId}/capabilities/measure`);
                        if (response && response.value !== undefined) {
                            humidityValue = response.value;
                            deviceEl.setAttribute('data-humidity', humidityValue);
                        }

                        // Subscribe to humidity updates
                        subscribeDevices.push({ deviceId: humidityDeviceId, capability: 'measure' });
                    }
                }
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error fetching values: ${JSON.stringify(error)}` });
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
        if (!deviceEl || !deviceEl.addEventListener) {
            return;
        }

        const icon = deviceEl.querySelector('.device-icon, .material-symbols-outlined');
        if (icon) {
            this.attachIconEvents(icon, deviceEl);
        }
    },

    async handleClick(deviceEl) {
        // For measure devices, show modal on click
        this.showDeviceModal(deviceEl);
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            // Check if this is a direct capability update or data from the 'measure' capability
            if (capability === 'measure_temperature') {
                deviceEl.setAttribute('data-temperature', value);

                // Update modal if it exists
                const deviceId = deviceEl.getAttribute('data-device-id');
                const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                if (modal) {
                    const tempValue = modal.querySelector('.temperature-value');
                    if (tempValue) {
                        tempValue.textContent = `${parseFloat(value).toFixed(1)}°C`;
                    }
                }
            } else if (capability === 'measure_humidity') {
                deviceEl.setAttribute('data-humidity', value);

                // Update modal if it exists
                const deviceId = deviceEl.getAttribute('data-device-id');
                const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                if (modal) {
                    const humidityValue = modal.querySelector('.humidity-value');
                    if (humidityValue) {
                        humidityValue.textContent = `${parseFloat(value).toFixed(0)}%`;
                    }
                }
            } else if (capability === 'measure') {
                // This is from the measure capability, could be combined or individual value
                if (value && typeof value === 'object') {
                    // Check if this is combined format (has temperature and humidity properties)
                    if (value.temperature && value.temperature.value !== undefined) {
                        deviceEl.setAttribute('data-temperature', value.temperature.value);

                        // Update modal if it exists
                        const deviceId = deviceEl.getAttribute('data-device-id');
                        const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                        if (modal) {
                            const tempValue = modal.querySelector('.temperature-value');
                            if (tempValue) {
                                tempValue.textContent = `${parseFloat(value.temperature.value).toFixed(1)}°C`;
                            }
                        }
                    }

                    if (value.humidity && value.humidity.value !== undefined) {
                        deviceEl.setAttribute('data-humidity', value.humidity.value);

                        // Update modal if it exists
                        const deviceId = deviceEl.getAttribute('data-device-id');
                        const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                        if (modal) {
                            const humidityValue = modal.querySelector('.humidity-value');
                            if (humidityValue) {
                                humidityValue.textContent = `${parseFloat(value.humidity.value).toFixed(0)}%`;
                            }
                        }
                    }

                    // For individual values with measureType property
                    if (value.measureType === 'measure_temperature' && value.value !== undefined) {
                        deviceEl.setAttribute('data-temperature', value.value);

                        // Update modal if it exists
                        const deviceId = deviceEl.getAttribute('data-device-id');
                        const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                        if (modal) {
                            const tempValue = modal.querySelector('.temperature-value');
                            if (tempValue) {
                                tempValue.textContent = `${parseFloat(value.value).toFixed(1)}°C`;
                            }
                        }
                    } else if (value.measureType === 'measure_humidity' && value.value !== undefined) {
                        deviceEl.setAttribute('data-humidity', value.value);

                        // Update modal if it exists
                        const deviceId = deviceEl.getAttribute('data-device-id');
                        const modal = document.querySelector(`.device-modal[data-device-id="${deviceId}"]`);
                        if (modal) {
                            const humidityValue = modal.querySelector('.humidity-value');
                            if (humidityValue) {
                                humidityValue.textContent = `${parseFloat(value.value).toFixed(0)}%`;
                            }
                        }
                    }
                }
            }

            // Ensure settings button exists
            this.ensureSettingsButton();
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    // Add this new method to ensure the settings button exists
    ensureSettingsButton() {
        // Check if the settings button exists
        const existingButton = document.querySelector('.settings-button');
        if (!existingButton) {
            // If not, create a new one
            const button = document.createElement('button');
            button.className = 'settings-button';
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

            // Add the click event to show floor selector
            button.addEventListener('click', async () => {
                try {
                    // Get all floors
                    const floors = await Homey.api('GET', '/floors');

                    if (!floors || floors.length === 0) {
                        return;
                    }

                    // If modal exists, remove it first
                    const existingModal = document.querySelector('.device-modal-overlay');
                    if (existingModal) {
                        existingModal.remove();
                    }

                    // Show the floor selector
                    if (typeof showFloorSelector === 'function') {
                        showFloorSelector(floors);
                    } else {
                        Homey.api('POST', '/error', { message: 'showFloorSelector function not found' });
                    }
                } catch (error) {
                    Homey.api('POST', '/error', { message: `Error showing floor selector: ${JSON.stringify(error)}` });
                }
            });

            // Add the button to the container
            const container = document.querySelector('.widget-container');
            if (container && button) {
                container.appendChild(button);
            }
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
                    if (iconWrapper && iconSpan) {
                        iconWrapper.appendChild(iconSpan);
                        
                        // Attach events to the newly created default icon
                        this.attachIconEvents(iconSpan, deviceEl);
                    }

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

        // Debug log to help diagnose the issue


        let measureCapabilities = [];

        // First try deviceData.measureCapabilities
        if (deviceData.measureCapabilities && Array.isArray(deviceData.measureCapabilities) && deviceData.measureCapabilities.length > 0) {
            measureCapabilities = deviceData.measureCapabilities;
        }
        // Then try deviceData.measureTypes (specific to this API)
        else if (deviceData.measureTypes && Array.isArray(deviceData.measureTypes) && deviceData.measureTypes.length > 0) {
            measureCapabilities = deviceData.measureTypes;
        }
        // Otherwise use empty array
        else {
            measureCapabilities = [];
        }

        // If measureCapabilities is empty, fallback to checking the values directly
        let hasTemperature = measureCapabilities.includes('measure_temperature');
        let hasHumidity = measureCapabilities.includes('measure_humidity');

        // If we don't have any capabilities but we have temperature/humidity values, use those instead
        if (!hasTemperature && !hasHumidity) {

            // Check if we have temperature or humidity attributes set with values
            if (temperature) {
                hasTemperature = true;
                // Add to measureCapabilities if not there
                if (!measureCapabilities.includes('measure_temperature')) {
                    measureCapabilities.push('measure_temperature');
                }
            }

            if (humidity) {
                hasHumidity = true;
                // Add to measureCapabilities if not there
                if (!measureCapabilities.includes('measure_humidity')) {
                    measureCapabilities.push('measure_humidity');
                }

            }
        }


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

        const modal = document.createElement('div');
        modal.className = 'device-modal measure-modal';
        modal.setAttribute('data-device-id', deviceId);

        let modalHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>`;

        if (hasTemperature && hasHumidity) {
            // Only show tabs if we have both capabilities
            modalHTML += `
            <div class="dim-view-toggle">
                <button class="view-button active" data-view="temperature">Temperature</button>
                <button class="view-button" data-view="humidity">Humidity</button>
            </div>
            <div class="dim-views">
                <div class="dim-view temperature-view active">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">device_thermostat</span>
                        <div class="temperature-value">${temperature ? `${parseFloat(temperature).toFixed(1)}°C` : 'N/A'}</div>
                    </div>
                </div>
                <div class="dim-view humidity-view">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">humidity_percentage</span>
                        <div class="humidity-value">${humidity ? `${parseFloat(humidity).toFixed(0)}%` : 'N/A'}</div>
                    </div>
                </div>
            </div>`;
        } else if (hasTemperature) {
            // Only temperature
            modalHTML += `
            <div class="dim-views">
                <div class="dim-view temperature-view active">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">device_thermostat</span>
                        <div class="temperature-value">${temperature ? `${parseFloat(temperature).toFixed(1)}°C` : 'N/A'}</div>
                    </div>
                </div>
            </div>`;
        } else if (hasHumidity) {
            // Only humidity
            modalHTML += `
            <div class="dim-views">
                <div class="dim-view humidity-view active">
                    <div class="measure-display">
                        <span class="material-symbols-outlined">humidity_percentage</span>
                        <div class="humidity-value">${humidity ? `${parseFloat(humidity).toFixed(0)}%` : 'N/A'}</div>
                    </div>
                </div>
            </div>`;
        }

        modal.innerHTML = modalHTML;

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
                    background: transparent;
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
                    background: transparent;
                    border-radius: 12px;
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
        if (document.body && overlay) {
            document.body.appendChild(overlay);
        }

        // Ensure the settings button is still visible
        this.ensureSettingsButton();

        // Close modal when clicking outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                // Re-check the settings button after modal is closed
                this.ensureSettingsButton();
            }
        });

        // Add close button handler
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
            // Re-check the settings button after modal is closed
            this.ensureSettingsButton();
        });

        // Add tab switching functionality if we have multiple capabilities
        if (hasTemperature && hasHumidity) {
            const viewButtons = modal.querySelectorAll('.view-button');
            viewButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Deactivate all buttons and views
                    viewButtons.forEach(btn => btn.classList.remove('active'));
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
            if (data) {


                // Handle all possible capability update types
                if (data.capability === 'measure_temperature' ||
                    data.capability === 'measure_humidity' ||
                    data.capability === 'measure') {

                    // For measure capability, the device ID could be in format: deviceId-measure-measure_temperature
                    // or deviceId-measure-measure_humidity or deviceId-measure-combined
                    let actualDeviceId = data.id;

                    // Handle special device ID formats for measure capability
                    if (data.id.includes('-measure-')) {
                        // Extract the base device ID
                        actualDeviceId = data.id.split('-measure-')[0];

                    }

                    // Find all elements for this device
                    const deviceElements = document.querySelectorAll(`[data-device-id="${actualDeviceId}"]`);

                    if (deviceElements.length > 0) {


                        deviceElements.forEach(deviceEl => {
                            this.handleDeviceUpdate(deviceEl, data.value, data.capability);
                        });
                    } else {

                        // As a fallback, try the original ID
                        const originalElements = document.querySelectorAll(`[data-device-id="${data.id}"]`);
                        originalElements.forEach(deviceEl => {
                            this.handleDeviceUpdate(deviceEl, data.value, data.capability);
                        });
                    }
                }
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
    },

    attachIconEvents(icon, deviceEl) {
        if (!icon) return;
        
        // Touch/Mouse event variables
        let touchStartTime = 0;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let longPressTimer = null;
        const TOUCH_TOLERANCE = 10;
        
        let mouseDownTime = 0;
        let mouseMoved = false;
        let mouseDownX = 0;
        let mouseDownY = 0;

        // Function to handle touch start
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
                } else {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }, 500);
        };

        // Function to handle touch move
        const handleTouchMove = (e) => {
            if (e.touches && e.touches[0]) {
                const moveX = Math.abs(e.touches[0].clientX - touchStartX);
                const moveY = Math.abs(e.touches[0].clientY - touchStartY);

                if (moveX > TOUCH_TOLERANCE || moveY > TOUCH_TOLERANCE) {
                    touchMoved = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
            }
        };

        // Function to handle touch end
        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pressDuration = Date.now() - touchStartTime;

            // Clear long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Reset visual feedback
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
            deviceEl.style.opacity = '1';

            // Handle short tap (not long press)
            if (!touchMoved && pressDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchStartTime = 0;
            touchMoved = false;
        };

        // Function to handle click (fallback for non-touch devices)
        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleClick(deviceEl);
        };

        // Function to handle mouse down
        const handleMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            mouseDownTime = Date.now();
            mouseMoved = false;
            mouseDownX = e.clientX;
            mouseDownY = e.clientY;

            // Add visual feedback
            deviceEl.style.transform = this.addScaleTransform(deviceEl, 1.2);
            deviceEl.style.opacity = '0.8';

            longPressTimer = setTimeout(() => {
                if (!mouseMoved) {
                    // Reset visual feedback before showing modal
                    deviceEl.style.transform = this.removeScaleTransform(deviceEl);
                    deviceEl.style.opacity = '1';
                    this.showDeviceModal(deviceEl);
                } else {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }, 500);
        };

        // Function to handle mouse move
        const handleMouseMove = (e) => {
            if (mouseDownTime > 0) {
                const moveThreshold = 10;
                const deltaX = Math.abs(e.clientX - mouseDownX);
                const deltaY = Math.abs(e.clientY - mouseDownY);

                if (deltaX > moveThreshold || deltaY > moveThreshold) {
                    mouseMoved = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
            }
        };

        // Function to handle mouse up
        const handleMouseUp = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pressDuration = Date.now() - mouseDownTime;

            // Clear long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Reset visual feedback
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
            deviceEl.style.opacity = '1';

            // Handle short click (not long press)
            if (!mouseMoved && pressDuration < 500) {
                this.handleClick(deviceEl);
            }

            mouseDownTime = 0;
            mouseMoved = false;
        };

        // Attach all event listeners
        icon.addEventListener('touchstart', handleTouchStart, { passive: false });
        icon.addEventListener('touchmove', handleTouchMove, { passive: false });
        icon.addEventListener('touchend', handleTouchEnd, { passive: false });
        icon.addEventListener('click', handleClick, { passive: false });
        icon.addEventListener('contextmenu', (e) => e.preventDefault());
        
        icon.addEventListener('mousedown', handleMouseDown, { passive: false });
        icon.addEventListener('mousemove', handleMouseMove, { passive: false });
        icon.addEventListener('mouseup', handleMouseUp, { passive: false });
        
        // Make sure icons are clickable
        icon.style.pointerEvents = 'auto';
        icon.style.cursor = 'pointer';
        icon.style.userSelect = 'none';
        icon.style.webkitUserSelect = 'none';
        icon.style.webkitTouchCallout = 'none';
        
        // For img elements, prevent drag behavior that might interfere
        if (icon.tagName.toLowerCase() === 'img') {
            icon.draggable = false;
            icon.addEventListener('dragstart', (e) => e.preventDefault());
        }
    },
}

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.measure = measureRenderer;

measureRenderer.setupExternalUpdates();
