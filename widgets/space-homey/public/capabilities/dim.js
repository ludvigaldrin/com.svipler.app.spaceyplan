const dimRenderer = {
    id: 'dim',

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
                        return;
                    }

                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) {
                        return;
                    }

                    const containerRect = container.getBoundingClientRect();
                    const displayX = (position.x / floorMapImage.naturalWidth) * containerRect.width;
                    const displayY = (position.y / floorMapImage.naturalHeight) * containerRect.height;
                    
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
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/dim`);

            if (response && typeof response.dim !== 'undefined') {
                deviceEl.setAttribute('data-dim', response.dim);
                deviceEl.setAttribute('data-state', response.onoff);
                deviceEl.classList.toggle('on', response.onoff);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [
                    { deviceId, capability: 'dim' },
                    { deviceId, capability: 'onoff' }
                ]
            });
        } catch (error) {
            console.error('Error initializing state:', error);
        }
    },

    initializeInteractions(deviceEl) {
        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;
        let startX, startY;

        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            touchStartTime = Date.now();
            touchMoved = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    this.showDeviceModal(deviceEl);
                }
            }, 500);
        }, { passive: false });

        deviceEl.addEventListener('touchmove', (e) => {
            const moveX = Math.abs(e.touches[0].clientX - startX);
            const moveY = Math.abs(e.touches[0].clientY - startY);
            
            // Only consider it a move if finger moved more than 10 pixels
            if (moveX > 10 || moveY > 10) {
                touchMoved = true;
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
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
                deviceEl.classList.toggle('on', value);
            } else if (capability === 'dim') {
                deviceEl.setAttribute('data-dim', value);
            }

            // Update modal if it exists
            const modalId = deviceEl.getAttribute('data-device-id');
            const modal = document.querySelector(`.device-modal[data-device-id="${modalId}"]`);
            if (modal) {
                if (capability === 'onoff') {
                    const powerButton = modal.querySelector('.power-button');
                    if (powerButton) {
                        powerButton.classList.toggle('on', value);
                    }
                } else if (capability === 'dim') {
                    const dimSlider = modal.querySelector('.dim-slider');
                    if (dimSlider) {
                        dimSlider.value = value;
                    }
                }
            }
        } catch (error) {
            console.error('Error in handleDeviceUpdate:', error);
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

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const currentState = deviceEl.getAttribute('data-state') === 'true';
        const currentDim = deviceEl.getAttribute('data-dim') || 0;

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

        // Add styles if not present
        if (!document.getElementById('dimModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'dimModalStyles';
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

                .dim-views > div {
                    display: none;
                }

                .dim-views > div.active {
                    display: block;
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

                .dim-slider-container {
                    padding: 12px;
                    margin: 12px auto;
                }

                .dim-slider {
                    width: 100%;
                    margin: 10px 0;
                    -webkit-appearance: none;
                    height: 20px;
                    background: #1C1C1E;
                    border-radius: 10px;
                }

                .dim-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: white;
                    cursor: pointer;
                    border: 2px solid #1C1C1E;
                }
            `;
            document.head.appendChild(styles);
        }

        modal.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="dim-view-toggle">
                <button class="view-button active" data-view="onoff">Power</button>
                <button class="view-button" data-view="dim">Dimmer</button>
            </div>
            <div class="dim-views">
                <div class="dim-view onoff-view active">
                    <div class="power-button ${currentState ? 'on' : ''}" role="button">
                        <div class="power-icon"></div>
                    </div>
                </div>
                <div class="dim-view dimmer-view">
                    <div class="dim-slider-container">
                        <input type="range" 
                               min="0" 
                               max="1" 
                               step="0.01" 
                               value="${currentDim}" 
                               class="dim-slider">
                    </div>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add view toggle handlers
        const viewButtons = modal.querySelectorAll('.view-button');
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const view = button.getAttribute('data-view');
                
                // Update buttons
                viewButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update views
                const onoffView = modal.querySelector('.onoff-view');
                const dimmerView = modal.querySelector('.dimmer-view');
                
                if (view === 'onoff') {
                    onoffView.classList.add('active');
                    dimmerView.classList.remove('active');
                } else {
                    onoffView.classList.remove('active');
                    dimmerView.classList.add('active');
                }
            });
        });

        // Add event listeners
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });

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
                Homey.api('POST', '/log', { message: `Error toggling power: ${error.message}` });
                powerButton.classList.toggle('on');
            }
        });

        // Handle dim slider changes
        const dimSlider = modal.querySelector('.dim-slider');
        dimSlider.addEventListener('input', this.debounce(async (e) => {
            try {
                const value = parseFloat(e.target.value);
                await Homey.api('PUT', `/devices/${deviceId}/capabilities/dim`, {
                    value: value
                });
            } catch (error) {
                Homey.api('POST', '/log', { message: `Error setting dim value: ${error.message}` });
            }
        }, 100));

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

};

// Make renderer globally available
window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.dim = dimRenderer; 