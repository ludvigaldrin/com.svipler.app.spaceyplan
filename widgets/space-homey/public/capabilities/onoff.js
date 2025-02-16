const onOffRenderer = {
    id: 'onoff',

    createDeviceElement(device, position) {
        // Add renderer-specific styles if not already present
        if (!document.getElementById('onoffStyles')) {
            const styles = document.createElement('style');
            styles.id = 'onoffStyles';
            styles.textContent = `
                .light-button {
                    position: absolute;
                    width: 35px;
                    height: 35px;
                    cursor: pointer;
                    z-index: 201;
                    background-color: rgba(255, 255, 255, 0.8) !important;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    transition: all 0.3s ease;
                    -webkit-user-select: none;
                    user-select: none;
                    -webkit-touch-callout: none;
                    pointer-events: auto;
                    -webkit-tap-highlight-color: transparent;
                    backdrop-filter: blur(2px);
                }

                .light-button.on,
                .light-button[data-state="true"] {
                    background-color: rgba(255, 215, 0, 0.8) !important;
                    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
                }

                .light-button img {
                    width: 24px;
                    height: 24px;
                    pointer-events: none;
                    z-index: 202;
                }

                .device-icon {
                    width: 24px;
                    height: 24px;
                    pointer-events: none;
                }

                .device-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(2px);
                }

                .device-modal-content {
                    background-color: rgba(245, 245, 245, 0.9) !important;
                    padding: 20px;
                    border-radius: 12px;
                    min-width: 250px;
                    text-align: center;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(5px);
                }

                .device-modal h2 {
                    margin: 0 0 20px 0;
                    font-size: 18px;
                    color: #333;
                }

                /* Switch styles */
                .switch {
                    position: relative;
                    display: inline-block;
                    width: 60px;
                    height: 34px;
                }

                .switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: .4s;
                }

                .slider:before {
                    position: absolute;
                    content: "";
                    height: 26px;
                    width: 26px;
                    left: 4px;
                    bottom: 4px;
                    background-color: white;
                    transition: .4s;
                }

                input:checked + .slider {
                    background-color: #ffd700;
                }

                input:checked + .slider:before {
                    transform: translateX(26px);
                }

                .slider.round {
                    border-radius: 34px;
                }

                .slider.round:before {
                    border-radius: 50%;
                }
            `;
            document.head.appendChild(styles);
        }

        const deviceEl = document.createElement('div');
        deviceEl.className = 'light-button';
        deviceEl.style.cssText = `
            left: ${position.x}%;
            top: ${position.y}%;
        `;

        deviceEl.setAttribute('data-name', device.name);

        if (device.iconObj?.url) {
            const img = document.createElement('img');
            img.src = device.iconObj.url;
            img.className = 'device-icon';
            deviceEl.appendChild(img);
        }

        return deviceEl;
    },

    handleTouchStart(e, deviceEl, deviceId, capability) {
        this.touchStartTime = Date.now();
        this.touchMoved = false;

        // Clear any existing timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
        }

        // Set up long press timer
        this.longPressTimer = setTimeout(() => {
            if (!this.touchMoved) {
                this.showDeviceModal(deviceEl, deviceId, capability);
            }
        }, 500);
    },

    handleTouchMove(e, deviceEl) {
        this.touchMoved = true;
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    },

    handleTouchEnd(e, deviceEl, deviceId, capability) {
        const touchDuration = Date.now() - this.touchStartTime;

        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (!this.touchMoved && touchDuration < 500) {
            this.handleClick(deviceEl, deviceId, capability);
        }

        this.touchMoved = false;
        this.touchStartTime = 0;
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
                await this.handleClick(deviceEl, deviceId, capability);
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

    async handleDeviceUpdate(deviceEl, value) {
        try {
            deviceEl.style.backgroundColor = value ? 'rgba(255, 215, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
            deviceEl.setAttribute('data-state', value);
            deviceEl.classList.toggle('on', value);
            
            // Update modal button if it exists
            const modalButton = document.querySelector('.power-button');
            if (modalButton) {
                modalButton.classList.toggle('on', value);
            }
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error handling onoff update: ${error.message}` });
        }
    },

    async initializeState(deviceEl, deviceId, capability) {
        try {
            const initialState = await Homey.api('GET', `/devices/${deviceId}/capabilities/${capability}`);
            await this.handleDeviceUpdate(deviceEl, initialState);

            // Subscribe to onoff capability
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: Homey.widgetId,
                devices: [
                    { deviceId, capability: 'onoff' }
                ]
            });
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error getting initial state for device ${deviceId}: ${error.message}` });
        }
    },

    async handleClick(deviceEl, deviceId, capability) {
        try {
            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;

            // Update visual state immediately
            await this.handleDeviceUpdate(deviceEl, newState);

            // Send the state change to the device
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/${capability}`, {
                value: newState
            });
        } catch (error) {
            // Revert visual state if there was an error
            await this.handleDeviceUpdate(deviceEl, currentState);
            Homey.api('POST', '/log', { message: `Error controlling device ${deviceId}: ${error.message}` });
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = onOffRenderer;
} else {
    window.capabilityRenderers = window.capabilityRenderers || {};
    window.capabilityRenderers.onoff = onOffRenderer;
} 