const onOffRenderer = {
    id: 'onoff',

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
            opacity: 0;  // Start hidden until positioned
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 12px 3px rgba(255, 255, 255, 0.45);
        `;

        // Store position data for later use
        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);

        // Add device attributes
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-state', device.state || false);

        // Store device data for later use
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        // Add icon if available
        if (device.iconObj?.url) {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'icon-wrapper';
            iconWrapper.style.cssText = `
                width: 14px;
                height: 14px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 50%;
                box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
            `;

            const img = document.createElement('img');
            img.src = device.iconObj.url;
            img.className = 'device-icon';
            img.style.cssText = `
                width: 14px;
                height: 14px;
                object-fit: contain;
                position: relative;
                z-index: 1;
            `;

            iconWrapper.appendChild(img);
            deviceEl.appendChild(iconWrapper);
        }

        // Create a promise to handle image loading and positioning
        const positionDevice = () => {
            return new Promise((resolve) => {
                const floorMapImage = document.getElementById('floorMapImage');
                const wrapper = document.getElementById('imageWrapper');
                const parentContainer = wrapper.parentElement;
                
                Homey.api('POST', '/log', { 
                    message: `Widget Parent Container: ${parentContainer.offsetWidth}x${parentContainer.offsetHeight}, Wrapper: ${wrapper.offsetWidth}x${wrapper.offsetHeight}`
                });

                const setPosition = () => {
                    if (!floorMapImage || !wrapper) return;
                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return;

                    const wrapperRect = wrapper.getBoundingClientRect();

                    // Debug logging for actual image dimensions
                    Homey.api('POST', '/log', { 
                        message: `Widget Image: Natural(${floorMapImage.naturalWidth}x${floorMapImage.naturalHeight}), Actual(${floorMapImage.offsetWidth}x${floorMapImage.offsetHeight}), Style(${window.getComputedStyle(floorMapImage).width}x${window.getComputedStyle(floorMapImage).height})`
                    });

                    const displayX = (position.x / 100) * wrapperRect.width;
                    const displayY = (position.y / 100) * wrapperRect.height;

                    // Debug logging
                    Homey.api('POST', '/log', { 
                        message: `OnOff Device ${device.id}: Original(${position.x}%, ${position.y}%) Calculated(${displayX}px, ${displayY}px)`
                    });

                    deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
                    deviceEl.style.opacity = '1';
                    resolve();
                };

                // Try to position immediately if image is loaded
                if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                    setPosition();
                } else if (floorMapImage) {
                    // Wait for image to load
                    floorMapImage.onload = setPosition;
                }

                // Retry positioning if initial attempt fails
                const retryInterval = setInterval(() => {
                    if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                        setPosition();
                        clearInterval(retryInterval);
                    }
                }, 100);

                // Clear interval after 5 seconds to prevent infinite retries
                setTimeout(() => clearInterval(retryInterval), 5000);
            });
        };

        // Execute positioning
        positionDevice().catch(error => {
            console.error('Error positioning device:', error);
            Homey.api('POST', '/log', { message: `Error positioning device: ${error.message}` });
        });

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/onoff`);
            console.log('Initial onoff state:', response);

            if (response && typeof response !== 'undefined') {
                deviceEl.setAttribute('data-state', response);
                deviceEl.classList.toggle('on', response);
            }

            // Get stored device data and update with real state
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.state = response;

            // Now apply color rules with correct state
            this.applyInitialColorRules(deviceData, deviceEl);

            // Subscribe to updates
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId, capability: 'onoff' }]
            });
        } catch (error) {
            console.error('Error initializing state:', error);
        }
    },

    initializeInteractions(deviceEl) {
        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;

        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    this.showDeviceModal(deviceEl);
                }
            }, 500);
        }, { passive: false });

        deviceEl.addEventListener('touchmove', (e) => {
            e.stopPropagation();
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            const touchDuration = Date.now() - touchStartTime;

            if (!touchMoved && touchDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchMoved = false;
        }, { passive: false });

        // Keep click for desktop/testing
        deviceEl.addEventListener('click', () => {
            this.handleClick(deviceEl);
        });
    },

    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-device-id');
            if (!deviceId) {
                console.error('No device ID found');
                return;
            }

            // Remove any "-onoff" suffix if it exists
            const cleanDeviceId = deviceId.replace('-onoff', '');

            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;

            console.log('Handling click for device:', cleanDeviceId, 'current state:', currentState, 'new state:', newState); // Debug log

            // Update visual state immediately for responsive feel
            this.handleDeviceUpdate(deviceEl, newState);

            // Send the state change to the device
            try {
                await Homey.api('PUT', `/devices/${cleanDeviceId}/capabilities/onoff`, {
                    value: newState
                });
            } catch (apiError) {
                console.error('API Error:', apiError);
                // Revert visual state if API call failed
                this.handleDeviceUpdate(deviceEl, currentState);
                throw apiError;
            }
        } catch (error) {
            console.error('Error in handleClick:', error);
            // Don't throw here - we've already handled the error
        }
    },

    handleDeviceUpdate(deviceEl, value) {
        if (!deviceEl) return;

        const deviceId = deviceEl.getAttribute('data-device-id');

        deviceEl.setAttribute('data-state', value);
        deviceEl.classList.toggle('on', value);

        // Handle image rule
        if (deviceEl.getAttribute('data-image-rule') === 'true') {
            // Add back the -onoff suffix for image lookup
            const imageId = `${deviceId}-onoff`;
            const imageEl = document.querySelector(`img[data-image-device-id="${imageId}"]`);
            if (imageEl) {
                try {
                    const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                    const imageViewRule = deviceData.rules?.find(r => r.type === 'imageView');

                    if (imageViewRule?.config) {
                        const getVisibilityValue = (value) => {
                            if (value === 'show') return 1;
                            if (value === 'hide') return 0;
                            return parseFloat(value);
                        };

                        const visibility = value ?
                            getVisibilityValue(imageViewRule.config.onStateVisibility) :
                            getVisibilityValue(imageViewRule.config.offStateVisibility);

                        imageEl.style.opacity = visibility;
                    }
                } catch (error) {
                    console.error('Error updating image visibility:', error);
                }
            }
        }

        // Update colors if there's a color rule
        if (deviceEl.getAttribute('data-color-rule') === 'true') {
            const allColor = deviceEl.getAttribute('data-all-color');
            if (allColor) {
                // All-Color rule takes precedence
                deviceEl.style.backgroundColor = `${allColor}59`;
                deviceEl.style.boxShadow = `0 0 12px 3px ${allColor}73`;
                const iconWrapper = deviceEl.querySelector('.icon-wrapper');
                if (iconWrapper) {
                    iconWrapper.style.backgroundColor = `${allColor}E6`;
                    iconWrapper.style.boxShadow = `0 0 8px ${allColor}CC`;
                }
            } else {
                // OnOff-Color rule
                const onColor = deviceEl.getAttribute('data-on-color');
                const offColor = deviceEl.getAttribute('data-off-color');
                const currentColor = value ? onColor : offColor;
                if (currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}59`;
                    deviceEl.style.boxShadow = `0 0 12px 3px ${currentColor}73`;
                    const iconWrapper = deviceEl.querySelector('.icon-wrapper');
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}E6`;
                        iconWrapper.style.boxShadow = `0 0 8px ${currentColor}CC`;
                    }
                }
            }
        }

        // Update modal if it exists
        const modalId = deviceEl.getAttribute('data-device-id');
        const modal = document.querySelector(`.device-modal[data-device-id="${modalId}"]`);
        if (modal) {
            const powerButton = modal.querySelector('.power-button');
            if (powerButton) {
                powerButton.classList.toggle('on', value);
            }
        }
    },

    applyInitialColorRules(device, deviceEl) {
        // Store complete device data including rules
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        const iconWrapper = deviceEl.querySelector('.icon-wrapper');

        // Check for Image View rule (can coexist with color rules)
        const imageViewRule = device.rules?.find(r => r.type === 'imageView');
        if (imageViewRule?.config) {
            deviceEl.setAttribute('data-image-rule', 'true');

            // Create image element if it doesn't exist
            let imageEl = document.querySelector(`img[data-image-device-id="${device.id}"]`);
            if (!imageEl && imageViewRule.config.imageData) {
                const container = document.getElementById('floorPlanContainer');
                const floorMapImage = document.getElementById('floorMapImage');

                imageEl = document.createElement('img');
                imageEl.className = 'device-state-image';
                imageEl.setAttribute('data-image-device-id', device.id);
                imageEl.src = imageViewRule.config.imageData;

                // Position and size relative to the floor map image
                const rect = floorMapImage.getBoundingClientRect();
                imageEl.style.cssText = `
                    position: absolute;
                    top: ${rect.top}px;
                    left: ${rect.left}px;
                    width: ${rect.width}px;
                    height: ${rect.height}px;
                    object-fit: cover;
                    transition: opacity 0.3s ease;
                    pointer-events: none;
                    z-index: 200;
                `;
                container.appendChild(imageEl);
            }

            // Set initial visibility based on state
            if (imageEl) {
                const getVisibilityValue = (value) => {
                    if (value === 'show') return 1;
                    if (value === 'hide') return 0;
                    return parseFloat(value);
                };

                const visibility = device.state ?
                    getVisibilityValue(imageViewRule.config.onStateVisibility) :
                    getVisibilityValue(imageViewRule.config.offStateVisibility);

                imageEl.style.opacity = visibility;
            }
        }

        // Continue with color rules
        const allColorRule = device.rules?.find(r => r.type === 'allColor');
        if (allColorRule?.config?.mainColor) {
            console.log('Applying allColor rule:', allColorRule.config.mainColor);
            deviceEl.setAttribute('data-all-color', allColorRule.config.mainColor);
            deviceEl.setAttribute('data-color-rule', 'true');
            deviceEl.style.backgroundColor = `${allColorRule.config.mainColor}59`;
            deviceEl.style.boxShadow = `0 0 12px 3px ${allColorRule.config.mainColor}73`;
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = `${allColorRule.config.mainColor}E6`;
                iconWrapper.style.boxShadow = `0 0 8px ${allColorRule.config.mainColor}CC`;
            }
        } else {
            // Check for OnOff-Color rule
            const iconColorRule = device.rules?.find(r => r.type === 'iconColor');
            if (iconColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', iconColorRule.config.onColor);
                deviceEl.setAttribute('data-off-color', iconColorRule.config.offColor);

                // Get the current state from the device
                const currentState = device.state === true;
                const initialColor = currentState ? iconColorRule.config.onColor : iconColorRule.config.offColor;

                deviceEl.style.backgroundColor = `${initialColor}59`;
                deviceEl.style.boxShadow = `0 0 12px 3px ${initialColor}73`;
                if (iconWrapper) {
                    iconWrapper.style.backgroundColor = `${initialColor}E6`;
                    iconWrapper.style.boxShadow = `0 0 8px ${initialColor}CC`;
                }
            }
        }
    },

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const currentState = deviceEl.getAttribute('data-state') === 'true';

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
        modal.className = 'device-modal';
        modal.setAttribute('data-device-id', deviceId);
        modal.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="dim-view-toggle">
                <button class="view-button active" data-view="onoff">Power</button>
            </div>
            <div class="dim-views">
                <div class="dim-view onoff-view active">
                    <div class="power-button ${currentState ? 'on' : ''}" role="button">
                        <div class="power-icon"></div>
                    </div>
                </div>
            </div>
        `;

        // Add styles if not present
        if (!document.getElementById('onoffModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'onoffModalStyles';
            styles.textContent = `
                .device-modal {
                    background: rgba(245, 245, 245, 0.95);
                    border-radius: 15px;
                    padding: 12px;
                    width: 260px;
                    max-width: 90vw;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 18px;
                    color: #333;
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
                    margin-bottom: 12px;
                }

                .view-button {
                    padding: 6px 12px;
                    border: 1px solid #1C1C1E;
                    background: none;
                    color: #1C1C1E;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .view-button.active {
                    background: #1C1C1E;
                    color: white;
                }

                .power-button {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: #1C1C1E;
                    position: relative;
                    cursor: pointer;
                    margin: 12px auto;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    transition: all 0.2s ease;
                }

                .power-button.on {
                    background: #FFFFFF;
                }

                .power-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 25px;
                    height: 25px;
                    transform: translate(-50%, -50%);
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18.36 6.64a9 9 0 1 1-12.73 0'/%3E%3Cline x1='12' y1='2' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center center;
                    background-size: contain;
                    transition: background-image 0.2s ease;
                }

                .power-button.on .power-icon {
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231C1C1E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18.36 6.64a9 9 0 1 1-12.73 0'/%3E%3Cline x1='12' y1='2' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center center;
                    background-size: contain;
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

        // Handle power button clicks
        const powerButton = modal.querySelector('.power-button');
        powerButton.addEventListener('click', async () => {
            try {
                const newState = !powerButton.classList.contains('on');
                powerButton.classList.toggle('on', newState);
                await this.handleClick(deviceEl);
            } catch (error) {
                powerButton.classList.toggle('on');
                console.error('Error toggling state:', error);
            }
        });

        // Add close button handler
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });
    },
};

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.onoff = onOffRenderer;
