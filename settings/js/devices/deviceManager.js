const deviceManager = {
    Homey: null,
    currentFloorId: null,
    supportedCapabilities: ['onoff', 'dim', 'alarm_motion', 'alarm_contact', 'measure_temperature', 'measure_humidity'],
    devices: [], // Cache for devices

    async initialize() {
        try {
            // Fetch devices once and cache them
            const devicesObj = await this.Homey.api('GET', '/devices');
            this.devices = Object.values(devicesObj).sort((a, b) => {
                // Sort by device name only
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } catch (err) {
            window.logError('Failed to initialize device manager:', err);
        }
    },

    setupDeviceDialog() {
        const addDeviceBtn = document.getElementById('addDevice');
        const deviceDialog = document.getElementById('deviceDialog');
        const closeButton = deviceDialog.querySelector('.modal-close-button');
        const cancelButton = document.getElementById('cancelDeviceDialog');
        const searchInput = document.getElementById('deviceSearch');
        const searchResults = document.getElementById('searchResults');

        // Initialize search input
        if (searchInput) {
            searchInput.addEventListener('input', debounce(async (e) => {
                const searchTerm = e.target.value.toLowerCase();

                try {
                    // Clear previous results
                    searchResults.innerHTML = '';

                    // Show all devices when search is empty
                    if (searchTerm.length === 0) {
                        // Show all devices when no search term is entered
                        this.updateSearchResults('', this.devices);
                        return;
                    }

                    // Show loading state
                    searchResults.innerHTML = '<div class="loading-state">Searching...</div>';

                    // Filter cached devices
                    const filteredDevices = this.devices.filter(device => {
                        const deviceName = (device.name || '').toLowerCase();
                        return deviceName.includes(searchTerm);
                    });

                    if (filteredDevices.length === 0) {
                        searchResults.innerHTML = '<div class="no-results">No devices found</div>';
                        return;
                    }

                    this.updateSearchResults(searchTerm, filteredDevices);

                } catch (err) {
                    window.logError('Search error:', err);
                    searchResults.innerHTML = '<div class="error-state">Error searching devices: ' + err.message + '</div>';
                }
            }, 300));
        }

        // Setup dialog open/close
        if (addDeviceBtn) {
            addDeviceBtn.addEventListener('click', () => {
                deviceDialog.style.display = 'flex';
                if (searchInput) {
                    searchInput.value = '';
                    // Show all devices initially
                    this.updateSearchResults('', this.devices);
                }
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                deviceDialog.style.display = 'none';
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                deviceDialog.style.display = 'none';
            });
        }
    },

    updateSearchResults(searchTerm, filteredDevices) {
        const resultsContainer = document.getElementById('searchResults');
        
        // Sort devices alphabetically to make finding easier
        const sortedDevices = [...filteredDevices].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        const html = sortedDevices.map(device => {
            const deviceCapabilities = device.capabilities || [];
            
            // Filter supported capabilities with special handling for dim/onoff
            let supported = deviceCapabilities.filter(cap =>
                this.supportedCapabilities.includes(cap)
            );
            
            // If device has both 'dim' and 'onoff', hide the 'onoff' capability
            // since 'dim' already includes 'onoff' functionality
            if (supported.includes('dim') && supported.includes('onoff')) {
                supported = supported.filter(cap => cap !== 'onoff');
            }
            
            // Note: We keep both measure_temperature and measure_humidity visible
            // when a device has both capabilities, as users might want to add either or both
            
            // Get unsupported capabilities
            const unsupported = deviceCapabilities.filter(cap => 
                !this.supportedCapabilities.includes(cap)
            );

            // Skip devices with no capabilities at all
            if (deviceCapabilities.length === 0) return '';
            
            // Don't skip devices with no supported capabilities
            // if (supported.length === 0) return '';

            // Get icon source - we don't have base64 yet at this stage
            let iconSrc = device.iconObj ? device.iconObj.url : '';

            // Check if there's an iconOverride property and it's not null
            if (device.hasOwnProperty('iconOverride') && device.iconOverride) {
                // Use our API endpoint instead of direct URL
                iconSrc = `https://my.homey.app/img/devices/${device.iconOverride}.svg`;
            }

            const deviceInfo = document.createElement('div');
            deviceInfo.className = 'device-item';
            
            // Create unique ID for this device's unsupported section
            const unsupportedSectionId = `unsupported-${device.id}`;

            // Show device zone when showing all devices (no search term)
            const zoneInfo = device.zone && !searchTerm ? 
                `<div class="device-zone">${device.zone.name || ''}</div>` : '';

            deviceInfo.innerHTML = `
                <div class="device-header">
                    <div class="device-icon">
                        <img src="${iconSrc}" alt="${device.name}" onerror="this.style.display='none'">
                    </div>
                    <div class="device-name">${device.name}</div>
                    ${zoneInfo}
                </div>
                <div class="capabilities-section">
                    ${supported.map(capability => {
                const displayName = this.getCapabilityDisplayName(capability);
                const isAdded = this.isDeviceCapabilityAdded(device.id, capability);
                return `
                            <div class="capability-row">
                                <span class="capability-name">${displayName}</span>
                                <button class="add-capability-btn ${isAdded ? 'added' : ''}" 
                                        data-device-id="${device.id}" 
                                        data-capability="${capability}"
                                        ${isAdded ? 'disabled' : ''}>
                                    ${isAdded ? 'Added' : 'Add'}
                                </button>
                            </div>`;
            }).join('')}
                    ${unsupported.length > 0 ? 
                    `<div class="show-unsupported">
                        <button class="toggle-unsupported-btn" data-target="${unsupportedSectionId}">
                            Show all capabilities (${unsupported.length})
                        </button>
                    </div>
                    <div id="${unsupportedSectionId}" class="unsupported-section" style="display: none;">
                        ${unsupported.map(capability => {
                            return `
                                <div class="capability-row unsupported">
                                    <span class="capability-name">${capability}</span>
                                    <span class="unsupported-badge">Unsupported</span>
                                </div>`;
                        }).join('')}
                    </div>` : ''}
                </div>
            `;

            deviceInfo.addEventListener('click', async (e) => {
                // Skip if clicking on a toggle button or inside unsupported section
                if (e.target.classList.contains('toggle-unsupported-btn') || 
                    e.target.closest('.unsupported-section')) {
                    return;
                }
                
                const deviceId = device.id;
                const capability = supported[0]; // Assuming the first supported capability is selected

                try {
                    // Disable button and show loading state
                    const addButton = document.querySelector(`.add-capability-btn[data-device-id="${deviceId}"][data-capability="${capability}"]`);
                    if (addButton) {
                        addButton.textContent = 'Adding...';
                        addButton.disabled = true;
                    }

                    await this.addDeviceToFloor(device, capability);

                    // Update button state
                    if (addButton) {
                        addButton.textContent = 'Added';
                        addButton.classList.add('added');
                    }

                } catch (err) {
                    window.logError('Failed to add device:', err);
                    this.Homey.alert(err.message || 'Failed to add device');

                    // Reset button state on error
                    if (addButton) {
                        addButton.disabled = false;
                        addButton.textContent = 'Add';
                    }
                }
            });

            return deviceInfo.outerHTML;
        }).join('');

        // If no supported devices found after filtering
        if (!html.trim()) {
            resultsContainer.innerHTML = '<div class="no-results">No supported devices found</div>';
            return;
        }

        resultsContainer.innerHTML = html;
        this.setupCapabilityButtonHandlers(filteredDevices);
        this.setupUnsupportedToggles();
    },

    getCapabilityDisplayName(capabilityId) {
        const displayNames = {
            'dim': 'Dim (with On/Off)',
            'onoff': 'On/Off',
            'alarm_contact': 'Sensor (Contact)',
            'alarm_motion': 'Sensor (Motion)',
            'measure_temperature': 'Temperature',
            'measure_humidity': 'Humidity'
        };
        return displayNames[capabilityId] || capabilityId;
    },

    isDeviceCapabilityAdded(deviceId, capability) {
        const floor = floorManager.floors.find(f => f.id === this.currentFloorId);
        if (!floor || !floor.devices) return false;

        // For alarm_motion and alarm_contact, check sensor-specific IDs
        if (capability === 'alarm_motion' || capability === 'alarm_contact') {
            return floor.devices.some(d => d.id === `${deviceId}-sensor-${capability}`);
        }

        // For measure_temperature and measure_humidity, check measure-specific IDs
        if (capability === 'measure_temperature' || capability === 'measure_humidity') {
            return floor.devices.some(d => d.id === `${deviceId}-measure-${capability}`);
        }

        // For onoff and dim, check the respective IDs
        if (capability === 'onoff') {
            // Check for both onoff and dim (since dim includes onoff)
            return floor.devices.some(d => 
                d.id === `${deviceId}-onoff` || d.id === `${deviceId}-dim`
            );
        }

        if (capability === 'dim') {
            return floor.devices.some(d => d.id === `${deviceId}-dim`);
        }

        // For other capabilities
        return floor.devices.some(d => d.id === deviceId);
    },

    async addDeviceToFloor(device, capability) {
        const floor = floorManager.floors.find(f => f.id === this.currentFloorId);
        if (!floor) {
            throw new Error('Current floor not found');
        }

        // Determine device ID based on capability
        let deviceId;
        let deviceCapability = capability;

        if (capability === 'dim') {
            deviceId = `${device.id}-dim`;
        } else if (capability === 'onoff') {
            deviceId = `${device.id}-onoff`;
        } else if (capability === 'alarm_motion' || capability === 'alarm_contact') {
            deviceId = `${device.id}-sensor-${capability}`;
            deviceCapability = 'sensor';
        } else if (capability === 'measure_temperature' || capability === 'measure_humidity') {
            deviceId = `${device.id}-measure-${capability}`;
            deviceCapability = 'measure';
        } else {
            deviceId = device.id;
        }

        // Create new device object with base structure
        const newDevice = {
            id: deviceId,
            homeyId: device.id,
            name: device.name,
            capability: deviceCapability,
            position: { x: 85, y: 85 },  // Center of the floor plan
            rules: [],
            iconOverride: device.hasOwnProperty('iconOverride') ? device.iconOverride : null  // Always copy the iconOverride property
        };

        // Add special type info for sensors and measures
        if (capability === 'alarm_motion' || capability === 'alarm_contact') {
            newDevice.sensorType = capability;
        } else if (capability === 'measure_temperature' || capability === 'measure_humidity') {
            newDevice.measureType = capability;
        }

        // Process icon if available
        try {
            // Show loading state
            const addButton = document.querySelector(`.add-capability-btn[data-device-id="${device.id}"][data-capability="${capability}"]`);
            if (addButton) {
                addButton.textContent = 'Processing icon...';
            }

            // Check if there's an iconOverride property and it's not null
            if (device.hasOwnProperty('iconOverride') && device.iconOverride) {
                // Use our API endpoint to get the icon
                const response = await this.Homey.api('GET', '/icons/' + device.iconOverride);
                if (!response.dataUrl) {
                    throw new Error(`Failed to fetch icon: ${response.status}`);
                }

                const data = response;
                // The base64 data URL is returned directly from our API
                newDevice.iconObj = {
                    ...(device.iconObj || {}),
                    base64: data.dataUrl
                };
            } else if (device.iconObj && device.iconObj.url) {
                // For regular icons, use the existing method
                const iconBase64 = await this.fetchImageAsBase64(device.iconObj.url);
                newDevice.iconObj = {
                    ...device.iconObj,
                    base64: iconBase64
                };
            } else {
                // No icon available
                newDevice.iconObj = device.iconObj;
            }
        } catch (err) {
            console.error('Failed to process icon:', err);
            // Fall back to original iconObj if conversion fails
            newDevice.iconObj = device.iconObj;
        }

        // Add default color rule for onoff and dim capabilities
        if (capability === 'onoff' || capability === 'dim') {
            newDevice.rules.push({
                id: generateUUID(),
                name: 'On/Off - Color Switcher',
                type: 'onOffColor',
                config: {
                    // On state settings
                    showIconOn: true,
                    iconColorOn: '#ffeb3b',
                    showCloudOn: true,
                    cloudColorOn: '#ffeb3b',

                    // Off state settings
                    showIconOff: true,
                    iconColorOff: '#ffffff',
                    showCloudOff: true,
                    cloudColorOff: '#ffffff'
                }
            });
        }

        // Add default color rule for alarm_contact and alarm_motion capabilities
        if (capability === 'alarm_contact' || capability === 'alarm_motion') {
            newDevice.rules.push({
                id: generateUUID(),
                name: 'On/Off - Color Switcher',
                type: 'onOffColor',
                config: {
                    // On state settings
                    showIconOn: true,
                    iconColorOn: '#ff0000',
                    showCloudOn: true,
                    cloudColorOn: '#ff0000',

                    // Off state settings
                    showIconOff: true,
                    iconColorOff: '#ffffff',
                    showCloudOff: true,
                    cloudColorOff: '#ffffff'
                }
            });
        }

        // Add default color rule for measure_temperature and measure_humidity
        if (capability === 'measure_temperature' || capability === 'measure_humidity') {
            newDevice.rules.push({
                id: generateUUID(),
                name: 'Default Style',
                type: 'measureStyle',
                config: {
                    iconColor: '#2196F3',
                    showCloud: true,
                    cloudColor: '#2196F3'
                }
            });
        }

        // Add new device to floor's devices array
        floor.devices.push(newDevice);

        try {
            // Save to Homey
            await this.Homey.set('floors', floorManager.floors);

            // Let floorManager handle UI updates with all devices
            floorManager.renderDevicesList(floor.devices);
            floorManager.renderFloorPlanDevices(floor);
        } catch (err) {
            window.logError('Failed to save device:', err);
            throw new Error('Failed to save device: ' + err.message);
        }
    },

    setupCapabilityButtonHandlers(filteredDevices) {
        document.querySelectorAll('.add-capability-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', async (e) => {
                    const deviceId = button.dataset.deviceId;
                    const capability = button.dataset.capability;
                    const device = filteredDevices.find(d => d.id === deviceId);

                    if (!device) {
                        window.logError('Device not found:', deviceId);
                        return;
                    }

                    try {
                        // Disable button and show loading state
                        button.disabled = true;
                        const originalText = button.textContent;
                        button.textContent = 'Adding...';

                        await this.addDeviceToFloor(device, capability);

                        // Update button state
                        button.textContent = 'Added';
                        button.classList.add('added');

                    } catch (err) {
                        window.logError('Failed to add device:', err);
                        this.Homey.alert(err.message || 'Failed to add device');

                        // Reset button state on error
                        button.disabled = false;
                        button.textContent = 'Add';
                    }
                });
            }
        });
    },

    // Helper function to fetch an image and convert it to base64
    async fetchImageAsBase64(url) {
        try {
            // Make sure URL is absolute
            if (url.startsWith('/')) {
                url = window.location.origin + url;
            }

            // Fetch the image
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }

            // Get the blob
            const blob = await response.blob();

            // Convert to base64
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            window.logError('Error converting image to base64:', err);
            throw err;
        }
    },

    setupUnsupportedToggles() {
        document.querySelectorAll('.toggle-unsupported-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering parent click events
                const targetId = button.dataset.target;
                const targetSection = document.getElementById(targetId);
                
                if (targetSection) {
                    const isVisible = targetSection.style.display !== 'none';
                    targetSection.style.display = isVisible ? 'none' : 'block';
                    button.textContent = isVisible ? 
                        `Show all capabilities (${targetSection.querySelectorAll('.capability-row').length})` : 
                        'Hide additional capabilities';
                }
            });
        });
    }
};

// Export for global access
window.deviceManager = deviceManager; 