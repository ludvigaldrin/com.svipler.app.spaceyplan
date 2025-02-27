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
            opacity: 0;
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 8px 1px rgba(255, 255, 255, 0.45);
        `;

        // Add a clickable overlay that extends slightly beyond the visible icon
        const clickableOverlay = document.createElement('div');
        clickableOverlay.className = 'clickable-overlay';
        clickableOverlay.style.cssText = `
            position: absolute;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 299;
            cursor: pointer;
            background-color: rgba(255, 255, 255, 0.01);
        `;
        deviceEl.appendChild(clickableOverlay);

        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-homey-id', device.homeyId);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-state', device.state || false);
        deviceEl.setAttribute('data-device', JSON.stringify(device));
        deviceEl.setAttribute('data-dim', device.dim || 1);

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

        const positionDevice = () => {
            return new Promise((resolve) => {
                const floorMapImage = document.getElementById('floorMapImage');
                const wrapper = document.getElementById('imageWrapper');

                const setPosition = () => {
                    if (!floorMapImage || !wrapper) return;
                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return;

                    const wrapperRect = wrapper.getBoundingClientRect();
                    const displayX = (position.x / 100) * wrapperRect.width;
                    const displayY = (position.y / 100) * wrapperRect.height;

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
        positionDevice().catch(error => {
            console.error('Error positioning device:', error);
            Homey.api('POST', '/log', { message: `Error positioning device: ${error.message}` });
        });

        // Apply initial rules
        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/dim`);

            if (response !== undefined) {
                const { dim, onoff } = response;
                deviceEl.setAttribute('data-state', onoff);
                deviceEl.classList.toggle('on', onoff);

                deviceEl.setAttribute('data-dim', dim);

                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.state = onoff;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                // Handle initial image visibility
                if (deviceEl.getAttribute('data-image-rule') === 'true') {
                    const ruleId = deviceEl.getAttribute('data-rule-id');
                    const imageEl = document.querySelector(`.state-image-${ruleId}`);

                    if (imageEl) {
                        const onOffImageRule = deviceData.rules?.find(r => r.id === ruleId);
                        if (onOffImageRule?.config) {
                            const showImage = onOffImageRule.config.showOn === onoff;
                            imageEl.style.display = showImage ? 'block' : 'none';
                        }
                    }
                }

                this.applyInitialRules(deviceData, deviceEl);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId: deviceId, capability: 'onoff' },
                { deviceId: deviceId, capability: 'dim' }
                ]
            });

        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in initializeState: ${error.message}` });
        }
    },

    initializeInteractions(deviceEl) {
        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;

        // Function to handle touch start for both the device element and overlay
        const handleTouchStart = (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;

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
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
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

            const touchDuration = Date.now() - touchStartTime;

            if (!touchMoved && touchDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchMoved = false;
        };

        // Function to handle click for both the device element and overlay
        const handleClick = () => {
            this.handleClick(deviceEl);
        };

        // Add event listeners to the device element
        deviceEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        deviceEl.addEventListener('touchmove', handleTouchMove);
        deviceEl.addEventListener('touchend', handleTouchEnd, { passive: false });
        deviceEl.addEventListener('click', handleClick);

        // Add event listeners to the clickable overlay
        const overlay = deviceEl.querySelector('.clickable-overlay');
        if (overlay) {
            overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
            overlay.addEventListener('touchmove', handleTouchMove);
            overlay.addEventListener('touchend', handleTouchEnd, { passive: false });
            overlay.addEventListener('click', handleClick);
        }
    },

    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-homey-id');
            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;
            // Update visual state immediately
            deviceEl.setAttribute('data-state', newState);
            deviceEl.classList.toggle('on', newState);
            this.handleDeviceUpdate(deviceEl, newState, 'onoff');

            // Send to Homey
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/onoff`, {
                value: newState
            });
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in handleClick: ${error.message}` });
        }
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            // Update state attribute and class
            if (capability === 'dim') {
                deviceEl.setAttribute('data-dim', value);
                const isOn = value > 0;
                deviceEl.setAttribute('data-state', isOn);
                deviceEl.classList.toggle('on', isOn);
                value = isOn; // For image rules, treat any dim > 0 as "on"
            } else {
                deviceEl.setAttribute('data-state', value);
                deviceEl.classList.toggle('on', value);
            }

            // Get device data and update state
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.state = value;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            const iconWrapper = deviceEl.querySelector('.icon-wrapper');

            // Reset cloud effect first
            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            // Handle image rule
            if (deviceEl.getAttribute('data-image-rule') === 'true') {
                const ruleId = deviceEl.getAttribute('data-rule-id');
                const imageEl = document.querySelector(`.state-image-${ruleId}`);

                if (imageEl) {
                    const onOffImageRule = deviceData.rules?.find(r => r.id === ruleId);

                    if (onOffImageRule?.config) {
                        const showImage = onOffImageRule.config.showOn === value;
                        imageEl.style.display = showImage ? 'block' : 'none';
                    }
                }
            }

            const allColorRule = deviceData.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {
                if (allColorRule.config.showCloud) {
                    const color = allColorRule.config.cloudColor || allColorRule.config.mainColor;
                    deviceEl.style.backgroundColor = `${color}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${color}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${color}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${color}E0`;
                    }
                }

                // Handle icon visibility and color
                if (iconWrapper) {
                    iconWrapper.style.display = allColorRule.config.showIcon ? 'flex' : 'none';
                    if (allColorRule.config.showIcon) {
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

            // Only process onOffColor if no allColor rule exists
            const onOffColorRule = deviceData.rules?.find(r => r.type === 'onOffColor');
            if (onOffColorRule?.config) {
                const currentColor = value ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = value ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = value ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = value ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                if (showCloud && currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                // Handle icon visibility and color
                if (iconWrapper) {
                    iconWrapper.style.display = showIcon ? 'flex' : 'none';
                    if (showIcon) {
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${iconColor})`;
                            } else {
                                iconElement.style.color = iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${iconColor})`;
                            }
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
                const dimSlider = modal.querySelector('.dim-slider');
                if (dimSlider && capability === 'dim') {
                    dimSlider.value = value;
                }
            }
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in handleDeviceUpdate: ${error.message}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');
            const currentState = device.state === true;

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

            // Check for onOffImageRule rule first
            const onOffImageRule = device.rules?.find(r => r.type === 'onOffImage');
            if (onOffImageRule?.config) {
                const ruleId = onOffImageRule.id;

                // Check if we've already initialized this device
                if (!deviceEl.hasAttribute('data-image-initialized')) {
                    // Remove ANY existing images first
                    const existingImages = document.querySelectorAll(`.state-image-${ruleId}`);
                    existingImages.forEach(img => img.remove());

                    deviceEl.setAttribute('data-image-rule', 'true');
                    deviceEl.setAttribute('data-image-initialized', 'true');
                    deviceEl.setAttribute('data-rule-id', ruleId);

                    const imageWrapper = document.getElementById('imageWrapper');
                    if (imageWrapper) {
                        const imageEl = document.createElement('img');


                        imageEl.style.cssText = `
                            display: none;
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            object-fit: contain;
                            pointer-events: none;
                            z-index: 200;
                        `;

                        imageEl.className = `state-image state-image-${ruleId}`;
                        imageWrapper.appendChild(imageEl);

                        imageEl.src = onOffImageRule.config.imageData;
                    }
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

            // Only process onOffColor if no allColor rule exists
            const onOffColorRule = device.rules?.find(r => r.type === 'onOffColor');
            if (!allColorRule && onOffColorRule?.config) {
                const currentColor = currentState ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = currentState ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = currentState ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = currentState ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', onOffColorRule.config.cloudColorOn);
                deviceEl.setAttribute('data-off-color', onOffColorRule.config.cloudColorOff);

                if (showCloud && currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                // Handle icon visibility and color
                if (iconWrapper) {
                    if (!showIcon) {
                        iconWrapper.style.display = 'none';
                    } else {
                        iconWrapper.style.display = 'flex';
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${iconColor})`;
                            } else {
                                iconElement.style.color = iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${iconColor})`;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in applyInitialRules: ${error.message}` });
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

                .material-symbols-outlined {
                    font-size: 32px; /* Consistent sizing for modal icons */
                }

                .dim-views > div {
                    display: none;
                }

                .dim-views > div.active {
                    display: block;
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

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add view toggle handlers
        const viewButtons = modal.querySelectorAll('.view-button');
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const view = button.getAttribute('data-view');
                viewButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

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

        // Add dim slider handler
        const dimSlider = modal.querySelector('.dim-slider');
        if (dimSlider) {
            dimSlider.addEventListener('input', this.debounce(async (e) => {
                try {
                    const value = parseFloat(e.target.value);
                    const homeyId = deviceEl.getAttribute('data-homey-id');
                    await Homey.api('PUT', `/devices/${homeyId}/capabilities/dim`, {
                        value: value
                    });

                } catch (error) {
                    Homey.api('POST', '/log', { message: `Error setting dim value: ${error.message}` });
                }
            }, 100));
        }
    },

    handleExternalUpdate(deviceEl, value, capability) {
        try {
            if (capability === 'dim') {
                deviceEl.setAttribute('data-dim', value);
                deviceEl.setAttribute('data-state', value > 0);
                deviceEl.classList.toggle('on', value > 0);
            } else if (capability === 'onoff') {
                deviceEl.setAttribute('data-state', value);
                deviceEl.classList.toggle('on', value);
            }

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            if (capability === 'dim') {
                deviceData.dim = value;
            }
            deviceData.state = capability === 'dim' ? value > 0 : value;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            // Update visual state using existing method
            this.handleDeviceUpdate(deviceEl, value, capability);

            const cleanDeviceId = deviceData.id.replace('-dim', '');
            const modal = document.querySelector(`.device-modal[data-device-id="${cleanDeviceId}"]`);
            if (modal) {
                const powerButton = modal.querySelector('.power-button');
                if (powerButton) {
                    powerButton.classList.toggle('on', value);
                }
                // Update modal's color display
                const deviceStateEl = modal.querySelector('.device-state');
                if (deviceStateEl) {
                    deviceStateEl.textContent = value ? 'ON' : 'OFF';
                    deviceStateEl.className = `device-state ${value ? 'on' : 'off'}`;
                }
            } else {
                Homey.api('POST', '/log', { message: `No modal found for device: ${cleanDeviceId}` });
            }
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in handleExternalUpdate: ${error.message}` });
        }
    },

    setupExternalUpdates() {
        if (!window.Homey) {
            Homey.api('POST', '/log', { message: 'No Homey object available' });
            return;
        }

        // Remove any existing listeners first
        window.Homey.removeAllListeners('realtime/device');

        window.Homey.on('realtime/device', (data) => {

            if (data && (data.capability === 'onoff' || data.capability === 'dim')) {
                const deviceElements = document.querySelectorAll(`[data-device-id="${data.id}-dim"]`);
                deviceElements.forEach(deviceEl => {
                    this.handleExternalUpdate(deviceEl, data.value, data.capability);
                });
            }
        });
    },

    // Add the debounce function to the renderer
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
};

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.dimn = dimRenderer;

dimRenderer.setupExternalUpdates();
