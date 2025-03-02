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
        positionDevice().catch(error => {
            Homey.api('POST', '/error', { message: `Error positioning device: ${JSON.stringify(error)}` });
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

            const touchDuration = Date.now() - touchStartTime;

            if (!touchMoved && touchDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchMoved = false;
        };

        // Function to handle click for both the device element and overlay
        const handleClick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
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
            Homey.api('POST', '/error', { message: `Error in handleClick: ${JSON.stringify(error)}` });
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
            Homey.api('POST', '/error', { message: `Error in handleDeviceUpdate: ${JSON.stringify(error)}` });
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
            Homey.api('POST', '/error', { message: `Error in applyInitialRules: ${JSON.stringify(error)}` });
        }
    },

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const homeyId = deviceEl.getAttribute('data-homey-id'); // Get the Homey ID for better matching
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
        modal.setAttribute('data-homey-id', homeyId); // Store Homey ID for updates
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
                    appearance: none; /* Standardized property */
                    height: 40px;
                    background: #1C1C1E;
                    border-radius: 20px;
                    outline: none; /* Remove default focus outline */
                    -webkit-tap-highlight-color: transparent; /* Remove tap highlight on Android */
                    touch-action: manipulation; /* Better than none - allows panning/zooming but optimizes for touch */
                    user-select: none; /* Prevent text selection */
                }

                .dim-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: white;
                    cursor: pointer;
                    border: 2px solid #1C1C1E;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3); /* Add shadow for better visibility */
                }

                /* Improved Android-specific styles */
                .dim-slider::-moz-range-thumb {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: white;
                    cursor: pointer;
                    border: 2px solid #1C1C1E;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                }
                
                /* Track styling for Firefox */
                .dim-slider::-moz-range-track {
                    height: 40px;
                    background: #1C1C1E;
                    border-radius: 20px;
                }
                
                /* Disable default styling completely */
                .dim-slider::-ms-track {
                    width: 100%;
                    cursor: pointer;
                    background: transparent; 
                    border-color: transparent;
                    color: transparent;
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
                Homey.api('POST', '/error', { message: `Error toggling state: ${JSON.stringify(error)}` });
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
            // Create a custom slider implementation that works better on mobile
            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'custom-slider-container';
            sliderContainer.style.cssText = `
                position: relative;
                width: 100%;
                height: 40px;
                background: #1C1C1E;
                border-radius: 20px;
                margin: 10px 0;
                overflow: hidden;
                touch-action: none;
                user-select: none;
            `;

            // Create the track fill element
            const trackFill = document.createElement('div');
            trackFill.className = 'track-fill';
            trackFill.style.cssText = `
                position: absolute;
                height: 100%;
                width: ${currentDim * 100}%;
                background: #4D90FE;
                border-radius: 20px 0 0 20px;
                transition: width 0.1s ease;
            `;

            // Create the thumb element
            const thumb = document.createElement('div');
            thumb.className = 'slider-thumb';
            thumb.style.cssText = `
                position: absolute;
                width: 48px;
                height: 48px;
                background: white;
                border-radius: 50%;
                top: 50%;
                left: ${currentDim * 100}%;
                transform: translate(-50%, -50%);
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                border: 2px solid #1C1C1E;
                z-index: 2;
            `;

            // Add elements to the slider container
            sliderContainer.appendChild(trackFill);
            sliderContainer.appendChild(thumb);

            // Function to update slider UI
            const updateSliderUI = (value) => {
                // Update track fill width
                trackFill.style.width = `${value * 100}%`;

                // Update thumb position
                thumb.style.left = `${value * 100}%`;
            };

            // Function to calculate value from position
            const calculateValue = (clientX) => {
                const rect = sliderContainer.getBoundingClientRect();
                let value = (clientX - rect.left) / rect.width;

                // Clamp value between 0 and 1
                value = Math.max(0, Math.min(1, value));

                return value;
            };

            // Custom touch/mouse handling for the slider
            let isDragging = false;

            // Touch events - improved for better sliding on Android
            sliderContainer.addEventListener('touchstart', (e) => {
                e.preventDefault();
                isDragging = true;
                document.body.style.overflow = 'hidden'; // Prevent page scrolling while sliding
                const value = calculateValue(e.touches[0].clientX);
                updateSliderUI(value);
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const value = calculateValue(e.touches[0].clientX);
                updateSliderUI(value);
            }, { passive: false });

            document.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                document.body.style.overflow = ''; // Restore page scrolling
                const value = calculateValue(e.changedTouches[0].clientX);
                updateSliderUI(value);
                sendValueToDevice(value);
            });

            document.addEventListener('touchcancel', (e) => {
                if (!isDragging) return;
                isDragging = false;
                document.body.style.overflow = ''; // Restore page scrolling
            });

            // Mouse events for desktop testing
            sliderContainer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                const value = calculateValue(e.clientX);
                updateSliderUI(value);
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const value = calculateValue(e.clientX);
                updateSliderUI(value);
            });

            document.addEventListener('mouseup', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const value = calculateValue(e.clientX);
                updateSliderUI(value);
                sendValueToDevice(value);
            });

            // Function to send value to device with debounce
            const sendValueToDevice = this.debounce(async (value) => {
                try {
                    const homeyId = deviceEl.getAttribute('data-homey-id');

                    // Only send dim value, not onoff
                    await Homey.api('PUT', `/devices/${homeyId}/capabilities/dim`, {
                        value: value
                    });

                    // Update the device element with the new dim value
                    deviceEl.setAttribute('data-dim', value);

                    // Only update visual state, don't toggle onoff
                    this.handleDeviceUpdate(deviceEl, value, 'dim');
                } catch (error) {
                    Homey.api('POST', '/error', { message: `Error setting dim value: ${JSON.stringify(error)}` });
                }
            }, 300);

            // Store references to UI elements for external updates
            modal.setAttribute('data-custom-slider', 'true');

            // Replace the original slider with our custom implementation
            const container = dimSlider.parentNode;
            container.innerHTML = ''; // Clear the container
            container.appendChild(sliderContainer);
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

            // Update any open modals for this device
            const homeyId = deviceEl.getAttribute('data-homey-id');
            const modals = document.querySelectorAll(`.device-modal[data-homey-id="${homeyId}"]`);

            modals.forEach(modal => {
                // Update power button
                const powerButton = modal.querySelector('.power-button');
                if (powerButton) {
                    const isOn = capability === 'dim' ? value > 0 : value;
                    powerButton.classList.toggle('on', isOn);
                }

                // Update custom slider if it exists and this is a dim update
                if (capability === 'dim' && modal.getAttribute('data-custom-slider') === 'true') {
                    const trackFill = modal.querySelector('.track-fill');
                    const thumb = modal.querySelector('.slider-thumb');

                    if (trackFill && thumb) {
                        // Update track fill width
                        trackFill.style.width = `${value * 100}%`;

                        // Update thumb position
                        thumb.style.left = `${value * 100}%`;
                    }
                }
            });

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in handleExternalUpdate: ${JSON.stringify(error)}` });
        }
    },

    setupExternalUpdates() {
        if (!window.Homey) {
            Homey.api('POST', '/error', { message: 'No Homey object available' });
            return;
        }

        // Remove any existing listeners first
        if (window.Homey.removeAllListeners) {
            window.Homey.removeAllListeners('realtime/device');
        }

        window.Homey.on('realtime/device', (data) => {
            if (data && (data.capability === 'onoff' || data.capability === 'dim')) {
                // Find all device elements that match this device ID
                const deviceElements = document.querySelectorAll(`[data-homey-id="${data.id}"]`);
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
