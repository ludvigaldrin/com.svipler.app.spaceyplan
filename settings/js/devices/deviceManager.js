const deviceManager = {
    Homey: null,
    currentFloorId: null,
    supportedCapabilities: ['onoff', 'dim', 'alarm_motion', 'alarm_contact'],
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
            console.error('Failed to initialize device manager:', err);
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

                    if (searchTerm.length < 2) {
                        searchResults.innerHTML = '<div class="initial-state">Start typing to search devices</div>';
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
                    console.error('Search error:', err);
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
                    searchResults.innerHTML = '<div class="initial-state">Start typing to search devices</div>';
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

        const html = filteredDevices.map(device => {
            const deviceCapabilities = device.capabilities || [];
            const supported = deviceCapabilities.filter(cap =>
                this.supportedCapabilities.includes(cap)
            );

            // Skip devices with no supported capabilities
            if (supported.length === 0) return '';

            return `
                <div class="device-item">
                    <div class="device-header">
                        <div class="device-icon">
                            <img src="${device.iconObj ? device.iconObj.url : ''}" alt="${device.name}">
                        </div>
                        <div class="device-name">${device.name}</div>
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
                    </div>
                </div>`;
        }).join('');

        // If no supported devices found after filtering
        if (!html.trim()) {
            resultsContainer.innerHTML = '<div class="no-results">No supported devices found</div>';
            return;
        }

        resultsContainer.innerHTML = html;
        this.setupCapabilityButtonHandlers(filteredDevices);
    },

    getCapabilityDisplayName(capabilityId) {
        const displayNames = {
            'dim': 'Dim (with On/Off)',
            'onoff': 'On/Off',
            'alarm_contact': 'Sensor (Contact)',
            'alarm_motion': 'Sensor (Motion)'
        };
        return displayNames[capabilityId] || capabilityId;
    },

    isDeviceCapabilityAdded(deviceId, capability) {
        const floor = floorManager.floors.find(f => f.id === this.currentFloorId);
        if (!floor || !floor.devices) return false;

        return floor.devices.some(d => {
            if (capability === 'alarm_motion' || capability === 'alarm_contact') {
                return d.id === `${deviceId}-sensor-${capability}`;
            }

            // For onoff and dim, check the modified device IDs
            const expectedId = capability === 'dim' ?
                `${deviceId}-dim` :
                capability === 'onoff' ?
                    `${deviceId}-onoff` :
                    deviceId;

            return d.id === expectedId;
        });
    },

    async addDeviceToFloor(device, capability) {
        const floor = floorManager.floors.find(f => f.id === this.currentFloorId);
        if (!floor) {
            throw new Error('Current floor not found');
        }

        const newDevice = {
            id: capability === 'dim' ? `${device.id}-dim` : capability === 'onoff' ? `${device.id}-onoff` : device.id,
            homeyId: device.id,
            name: device.name,
            capability: capability,
            iconObj: device.iconObj,
            position: { x: 5, y: 5 },  // Center of the floor plan (was 10, 10)
            rules: []
        };

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

            // Special handling for sensors
            newDevice.id = `${device.id}-sensor-${capability}`;
            newDevice.capability = 'sensor';
            newDevice.sensorType = capability;
        }

        // Add new device to floor's devices array
        floor.devices.push(newDevice);

        try {
            // Save to Homey
            await this.Homey.set('floors', floorManager.floors);

            // Let floorManager handle UI updates with all devices
            floorManager.renderDevicesList(floor.devices);
            floorManager.renderFloorPlanDevices(floor);

            // Close the dialog
            document.getElementById('deviceDialog').style.display = 'none';
        } catch (err) {
            console.error('Failed to save device:', err);
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
                        console.error('Device not found:', deviceId);
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
                        console.error('Failed to add device:', err);
                        this.Homey.alert(err.message || 'Failed to add device');

                        // Reset button state on error
                        button.disabled = false;
                        button.textContent = 'Add';
                    }
                });
            }
        });
    }
};

// Export for global access
window.deviceManager = deviceManager; 