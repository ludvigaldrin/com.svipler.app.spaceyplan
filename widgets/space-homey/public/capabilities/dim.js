const dimRenderer = {
    id: 'dim',

    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = 'dim-device';
        
        deviceEl.style.cssText = `
            position: absolute;
            left: ${position.x}%;
            top: ${position.y}%;
            transform: translate(-50%, -50%);
            width: 22px;
            height: 22px;
            cursor: pointer;
            z-index: 300;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;

        // Add device attributes
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-capability', 'dim');
        deviceEl.setAttribute('data-state', device.state || false);

        // Add icon if available
        if (device.iconObj?.url) {
            const img = document.createElement('img');
            img.src = device.iconObj.url;
            img.className = 'device-icon';
            img.style.cssText = `
                width: 14px;
                height: 14px;
                object-fit: contain;
            `;
            deviceEl.appendChild(img);
        }

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId) {
        try {
            // Get initial state - includes both dim and onoff
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/dim`);

            if (response && typeof response.dim !== 'undefined') {
                deviceEl.setAttribute('data-dim', response.dim);
                deviceEl.setAttribute('data-state', response.onoff);
                deviceEl.classList.toggle('on', response.onoff);
            }

            // Subscribe to both capabilities since dim devices need both
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: Homey.widgetId,
                devices: [
                    { deviceId, capability: 'dim' },
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

        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchStartTime = Date.now();
            longPressTimer = setTimeout(() => {
                this.showDimPopup(deviceEl);
            }, 500); // Show dim popup after 500ms
        });

        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearTimeout(longPressTimer);
            if (Date.now() - touchStartTime < 500) {
                this.handleClick(deviceEl); // Quick tap toggles on/off
            }
        });

        deviceEl.addEventListener('click', () => {
            this.handleClick(deviceEl);
        });
    },

    // Debounce function
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

    showDimPopup(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const currentDim = parseFloat(deviceEl.getAttribute('data-dim')) || 0;
        const currentState = deviceEl.getAttribute('data-state') === 'true';

        const overlay = document.createElement('div');
        overlay.className = 'device-modal';

        const popup = document.createElement('div');
        popup.className = 'device-modal-content';

        popup.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="dim-view-toggle">
                <button class="view-button" data-view="onoff">Power</button>
                <button class="view-button active" data-view="dim">Dimmer</button>
            </div>
            <div class="dim-views">
                <div class="dim-view onoff-view">
                    <div class="power-button ${currentState ? 'on' : ''}" role="button">
                        <div class="power-icon"></div>
                    </div>
                </div>
                <div class="dim-view dimmer-view active">
                    <div class="dim-slider-container">
                        <div class="dim-slider-wrapper">
                            <input type="range" 
                                   min="0" 
                                   max="1" 
                                   step="0.01" 
                                   value="${currentDim}" 
                                   class="dim-slider">
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add styles if not already present
        if (!document.getElementById('dimModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'dimModalStyles';
            styles.textContent = `
                .device-modal-content {
                    background: rgba(245, 245, 245, 0.95);
                    border-radius: 15px;
                    padding: 20px;
                    width: 300px;
                    height: 300px;
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

                .dim-slider-container {
                    width: 100%;
                    padding: 20px 40px;
                }

                .dim-slider-wrapper {
                    width: 100%;
                    position: relative;
                }

                .dim-slider {
                    width: 100%;
                    height: 6px;
                    -webkit-appearance: none;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 3px;
                    cursor: pointer;
                }

                .dim-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    margin-top: -7px;
                    border: none;
                }

                .dim-slider:focus {
                    outline: none;
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
            `;
            document.head.appendChild(styles);
        }

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // Handle view switching
        const viewButtons = popup.querySelectorAll('.view-button');
        const views = popup.querySelectorAll('.dim-view');

        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const viewType = button.getAttribute('data-view');
                
                // Update buttons
                viewButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update views - simple toggle
                const onoffView = popup.querySelector('.onoff-view');
                const dimView = popup.querySelector('.dimmer-view');
                
                if (viewType === 'onoff') {
                    onoffView.classList.add('active');
                    dimView.classList.remove('active');
                } else {
                    dimView.classList.add('active');
                    onoffView.classList.remove('active');
                }
                
            });
        });

        // Handle power button click
        const powerButton = popup.querySelector('.power-button');
        powerButton.addEventListener('click', async () => {
            try {
                const newState = !powerButton.classList.contains('on');
                powerButton.classList.toggle('on', newState);
                await this.handleClick(deviceEl);
            } catch (error) {
                powerButton.classList.toggle('on');
                Homey.api('POST', '/log', { message: `Error toggling state: ${error.message}` });
            }
        });

        // Handle close button click
        const closeButton = popup.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });

        // Handle dim slider
        const slider = popup.querySelector('.dim-slider');
        const valueDisplay = popup.querySelector('.dim-value');

        const debouncedUpdate = this.debounce(async (value) => {
            try {
                const deviceId = deviceEl.getAttribute('data-device-id');
                await Homey.api('PUT', `/devices/${deviceId}/capabilities/dim`, {
                    value: value
                });
                this.handleDeviceUpdate(deviceEl, value, 'dim');
            } catch (error) {
                Homey.api('POST', '/log', { message: `Error setting dim value: ${error.message}` });
            }
        }, 100);

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            debouncedUpdate(value);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    },

    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-device-id');
            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;

            // Update visual state immediately
            this.handleDeviceUpdate(deviceEl, newState, 'onoff');

            // Send the state change to the device
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/onoff`, {
                value: newState
            });
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in handleClick: ${error.message}` });
        }
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (capability === 'onoff') {
                deviceEl.setAttribute('data-state', value);
            } else if (capability === 'dim') {
                deviceEl.setAttribute('data-dim', value);
            }
        } catch (error) {
            console.error('Error in handleDeviceUpdate:', error);
        }
    },

    applyInitialColorRules(device, deviceEl) {
        // Check for All-Color rule first
        const allColorRule = device.rules?.find(r => r.type === 'allColor');
        if (allColorRule?.config?.mainColor) {
            deviceEl.setAttribute('data-all-color', allColorRule.config.mainColor);
            deviceEl.setAttribute('data-color-rule', 'true');
            deviceEl.style.backgroundColor = `${allColorRule.config.mainColor}A6`;
            deviceEl.style.color = allColorRule.config.mainColor;
            deviceEl.classList.add('glow');
        } else {
            // Check for OnOff-Color rule
            const iconColorRule = device.rules?.find(r => r.type === 'iconColor');
            if (iconColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', iconColorRule.config.onColor);
                deviceEl.setAttribute('data-off-color', iconColorRule.config.offColor);
                
                const initialColor = device.state ? iconColorRule.config.onColor : iconColorRule.config.offColor;
                deviceEl.style.backgroundColor = `${initialColor}A6`;
                deviceEl.style.color = initialColor;
                deviceEl.classList.add('glow');
            } else {
                // Default - white with glow
                deviceEl.style.backgroundColor = 'rgba(255, 255, 255, 0.65)';
                deviceEl.style.color = 'rgba(255, 255, 255, 0.8)';
                deviceEl.classList.add('glow');
            }
        }
    }
};

// Make renderer globally available
window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.dim = dimRenderer; 