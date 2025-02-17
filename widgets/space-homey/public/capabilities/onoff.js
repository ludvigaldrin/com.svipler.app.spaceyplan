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
                const container = document.getElementById('floorPlanContainer');

                const setPosition = () => {
                    if (!floorMapImage || !container) {
                        Homey.api('POST', '/log', { message: 'OnOff Floor map image or container not found' });
                        return;
                    }

                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) {
                        Homey.api('POST', '/log', { message: 'OnOff Floor map image not loaded yet' });
                        return;
                    }

                    const containerRect = container.getBoundingClientRect();
                    const displayX = (position.x / floorMapImage.naturalWidth) * containerRect.width;
                    const displayY = (position.y / floorMapImage.naturalHeight) * containerRect.height;
                    
                    deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
                    deviceEl.style.opacity = '1';
                    Homey.api('POST', '/log', { message: 'OnOff Floor map image loaded' });
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

    async initializeState(deviceEl, deviceId) {
        try {
            // Get initial state
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/onoff`);

            if (response && typeof response !== 'undefined') {
                deviceEl.setAttribute('data-state', response);
                deviceEl.classList.toggle('on', response);
            }

            // Subscribe to capability
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: Homey.widgetId,
                devices: [
                    { deviceId, capability: 'onoff' }
                ]
            });

        } catch (error) {
            Homey.api('POST', '/log', { message: `Error initializing state: ${error.message}` });
        }
    },

    initializeInteractions(deviceEl) {

        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;

        const handleTouchStart = (e) => {
            e.preventDefault();
            console.log('Touch start'); // Debug log
            touchStartTime = Date.now();
            touchMoved = false;

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {

                    this.showDeviceModal(deviceEl, deviceEl.getAttribute('data-device-id'), 'onoff');
                }
            }, 500);
        };

        const handleTouchMove = () => {
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();


            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            const touchDuration = Date.now() - touchStartTime;

            if (!touchMoved && touchDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchMoved = false;
        };

        // Add touch event listeners
        deviceEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        deviceEl.addEventListener('touchmove', handleTouchMove);
        deviceEl.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Keep click for desktop/testing
        deviceEl.addEventListener('click', () => {
            console.log('Click detected'); // Debug log
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

        deviceEl.setAttribute('data-state', value);

        // Update visual appearance based on state
        if (value) {
            deviceEl.style.opacity = '1';
            // Add any other "on" state visual updates
        } else {
            deviceEl.style.opacity = '0.7';
            // Add any other "off" state visual updates
        }


    },


    applyInitialColorRules(device, deviceEl) {
        const iconWrapper = deviceEl.querySelector('.icon-wrapper');

        // Check for All-Color rule first
        const allColorRule = device.rules?.find(r => r.type === 'allColor');
        if (allColorRule?.config?.mainColor) {
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

                const initialColor = device.state ? iconColorRule.config.onColor : iconColorRule.config.offColor;
                deviceEl.style.backgroundColor = `${initialColor}59`;
                deviceEl.style.boxShadow = `0 0 12px 3px ${initialColor}73`;
                if (iconWrapper) {
                    iconWrapper.style.backgroundColor = `${initialColor}E6`;
                    iconWrapper.style.boxShadow = `0 0 8px ${initialColor}CC`;
                }
            }
            // Default styling is already set in createDeviceElement
        }
    },


    showDeviceModal(deviceEl, deviceId, capability) {
        const name = deviceEl.getAttribute('data-name');
        const currentState = deviceEl.getAttribute('data-state') === 'true';

        // Create modal container
        const overlay = document.createElement('div');
        overlay.className = 'device-modal';

        const modal = document.createElement('div');
        modal.className = 'device-modal-content';
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
                .device-modal-content {
                    background: rgba(245, 245, 245, 0.95);
                    border-radius: 15px;
                    padding: 20px;
                    width: 300px;
                    height: 300px;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
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
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s ease;
                    padding: 0;
                    margin: 0;
                }

                .close-button:hover {
                    background-color: rgba(0, 0, 0, 0.1);
                }

                .dim-view-toggle {
                    background: rgba(0, 0, 0, 0.1);
                    padding: 2px;
                    border-radius: 20px;
                    display: flex;
                    margin: 20px 0;
                }

                .view-button {
                    flex: 1;
                    padding: 8px;
                    border: none;
                    border-radius: 18px;
                    background: transparent;
                    color: #000;
                    font-size: 15px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .view-button.active {
                    background: #fff;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .dim-views {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 180px;
                }

                .dim-view {
                    display: none;
                    width: 100%;
                    height: 100%;
                    align-items: center;
                    justify-content: center;
                }

                .dim-view.active {
                    display: flex;
                }

                /* Power button styles */
                .power-button {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: #1C1C1E;
                    position: relative;
                    cursor: pointer;
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
                    width: 50px;
                    height: 50px;
                    transform: translate(-50%, -50%);
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18.36 6.64a9 9 0 1 1-12.73 0'/%3E%3Cline x1='12' y1='2' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center center;
                    background-size: contain;
                    transition: background-image 0.2s ease;
                    pointer-events: none;
                }

                .power-button.on .power-icon {
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231C1C1E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18.36 6.64a9 9 0 1 1-12.73 0'/%3E%3Cline x1='12' y1='2' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center center;
                    background-size: contain;
                }
            `;
            document.head.appendChild(styles);
        }

        overlay.appendChild(modal);

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
                // Revert visual state if there was an error
                powerButton.classList.toggle('on');
                Homey.api('POST', '/log', { message: `Error toggling state: ${error.message}` });
            }
        });

        // Add close button handler
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });

        document.body.appendChild(overlay);
    },
};



window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.onoff = onOffRenderer;
