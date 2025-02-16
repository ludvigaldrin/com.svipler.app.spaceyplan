// Make sure to include HomeyAPI at the top of the file
if (typeof HomeyAPI === 'undefined') {
    throw new Error('HomeyAPI is not loaded');
}

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function onHomeyReady(Homey) {
    // Test log message when settings loads
    Homey.api('POST', '/log', { message: 'Settings page loaded!' }, (err) => {
        if (err) {
            Homey.alert('Failed to log: ' + err);
        }
    });

    let floors = [];
    let homeyApi = null;
    let homeyDevices = []; // Store devices globally
    let currentFloorId = null; // Add this at the top with other state variables

    // Function to load all devices from Homey
    async function loadHomeyDevices() {
        return new Promise((resolve, reject) => {
            Homey.api('GET', '/devices', null, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(Object.values(result));
            });
        });
    }
    
    // Initialize
    async function init() {
        try {
            await loadFloors();
            // Pre-load devices once
            homeyDevices = await loadHomeyDevices();
        } catch (err) {
            Homey.alert(err);
        }
        
        Homey.ready();
    }

    async function loadFloors() {
        const savedFloors = await Homey.get('floors');
        if (savedFloors) {
            floors = savedFloors;
            renderFloorsList();
        }
    }

    let currentDeleteId = null;

    function setupEventListeners() {
        // Add Floor button
        document.getElementById('addFloor').addEventListener('click', () => {
            document.getElementById('newFloorDialog').style.display = 'flex';
        });

        // Cancel new floor
        document.getElementById('cancelNewFloor').addEventListener('click', () => {
            closeNewFloorDialog();
        });

        // Back to list
        document.getElementById('backToList').addEventListener('click', () => {
            document.getElementById('floorEditView').style.display = 'none';
            document.getElementById('floorsListView').style.display = 'block';
        });

        // Save new floor
        document.getElementById('saveNewFloor').addEventListener('click', async (event) => {
            const saveButton = event.target;
            const cancelButton = document.getElementById('cancelNewFloor');
            
            try {
                // Disable buttons and show loading state
                saveButton.disabled = true;
                cancelButton.disabled = true;
                saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

                const name = document.getElementById('floorName').value;
                const imageData = document.getElementById('imagePreview').querySelector('img')?.src;
                
                if (!name || !imageData) {
                    throw new Error('Please provide both a name and an image');
                }

                const newFloor = {
                    id: Date.now().toString(),
                    name,
                    imageData,
                    devices: []
                };

                floors.push(newFloor);
                await saveFloors();
                
                // Close dialog and refresh
                closeNewFloorDialog();
                renderFloorsList();
                
                // Show success message
                Homey.alert('Floor plan created successfully!', 'success');
                
            } catch (err) {
                Homey.alert(err.message || 'Failed to create floor plan');
            } finally {
                // Reset button states
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.innerHTML = 'Create Floor';
            }
        });

        // Handle image upload
        document.getElementById('floorImage').addEventListener('change', handleImageUpload);

        // Add to setupEventListeners function
        document.getElementById('closeDeviceDialogBtn').addEventListener('click', () => {
            document.getElementById('deviceDialog').style.display = 'none';
        });

        document.getElementById('cancelDeviceDialog').addEventListener('click', () => {
            document.getElementById('deviceDialog').style.display = 'none';
        });

        // Add delete dialog event listeners
        document.getElementById('cancelDelete').addEventListener('click', () => {
            document.getElementById('deleteConfirmDialog').style.display = 'none';
            currentDeleteId = null;
        });

        document.getElementById('confirmDelete').addEventListener('click', async () => {
            if (!currentDeleteId) return;
            
            const confirmButton = document.getElementById('confirmDelete');
            const cancelButton = document.getElementById('cancelDelete');
            const dialog = document.getElementById('deleteConfirmDialog');

            try {
                confirmButton.disabled = true;
                cancelButton.disabled = true;
                confirmButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';
                
                // Remove the floor from the array
                floors = floors.filter(f => f.id !== currentDeleteId);
                
                // Save to Homey settings
                await saveFloors();
                
                // Close dialog
                dialog.style.display = 'none';
                
                // Refresh the list
                renderFloorsList();
                
                // Show success message
                Homey.alert('Floor plan deleted successfully!', 'success');
            } catch (err) {
                Homey.error('Delete error:', err);
                Homey.alert('Failed to delete floor plan');
            } finally {
                confirmButton.disabled = false;
                cancelButton.disabled = false;
                confirmButton.innerHTML = 'Delete';
                currentDeleteId = null;
            }
        });

        // Close buttons for dialogs
        document.getElementById('closeNewFloorDialog').addEventListener('click', () => {
            closeNewFloorDialog();
        });

        document.getElementById('closeDeleteDialog').addEventListener('click', () => {
            document.getElementById('deleteConfirmDialog').style.display = 'none';
            currentDeleteId = null;
        });

        // Initialize HomeyAPI
        async function initializeHomeyAPI() {
            try {
                if (!homeyApi) {
                    homeyApi = await HomeyAPI.createAppAPI({ homey: Homey });
                }
                return homeyApi;
            } catch (err) {
                Homey.error('Failed to initialize HomeyAPI:', err);
                throw new Error('Failed to initialize HomeyAPI');
            }
        }

        // Update the device search handler
        document.getElementById('deviceSearch').addEventListener('input', debounce(async function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            const resultsContainer = document.getElementById('searchResults');
            
            if (searchTerm === '') {
                resultsContainer.innerHTML = '<div class="initial-state">Start typing to search for devices</div>';
                return;
            }

            try {
                const filteredDevices = homeyDevices.filter(device => 
                    device.name.toLowerCase().includes(searchTerm)
                );
                
                if (filteredDevices.length === 0) {
                    resultsContainer.innerHTML = '<div class="no-results">No devices found</div>';
                    return;
                }

                // Only support onoff capability for now
                const supportedCapabilities = ['onoff'];
                
                resultsContainer.innerHTML = filteredDevices.map(device => {
                    // Split capabilities into supported and unsupported
                    const deviceCapabilities = device.capabilities || [];
                    const supported = deviceCapabilities.filter(cap => supportedCapabilities.includes(cap));
                    const unsupported = deviceCapabilities.filter(cap => !supportedCapabilities.includes(cap));

                    return `
                        <div class="device-item" data-id="${device.id}">
                            <div class="device-header">
                                <div class="device-icon">
                                    <img src="${device.iconObj?.url || 'default-icon.png'}" alt="${device.name}">
                                </div>
                                <div class="device-name">${device.name}</div>
                            </div>
                            <div class="capabilities-list">
                                ${supported.map(capabilityId => {
                                    const isAdded = isDeviceCapabilityAdded(device.id, capabilityId);
                                    return `
                                        <div class="capability-item">
                                            <div class="capability-info">
                                                <span class="capability-name"><strong>${formatCapabilityName(capabilityId)}</strong></span>
                                            </div>
                                            <button class="add-capability-btn ${isAdded ? 'added' : ''}" 
                                                    data-device-id="${device.id}" 
                                                    data-capability="${capabilityId}"
                                                    ${isAdded ? 'disabled' : ''}>
                                                <svg width="24" height="24" viewBox="0 0 24 24">
                                                    <path d="${isAdded ? 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z' : 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'}"/>
                                                </svg>
                                            </button>
                                        </div>
                                    `;
                                }).join('')}
                                ${unsupported.length > 0 ? `
                                    <div class="unsupported-capabilities">
                                        <em>(Unsupported capabilities: ${unsupported.map(formatCapabilityName).join(', ')})</em>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Add click handlers for capability buttons
                document.querySelectorAll('.add-capability-btn').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const deviceId = this.dataset.deviceId;
                        const capability = this.dataset.capability;
                        const device = filteredDevices.find(d => d.id === deviceId);
                        addDeviceToFloor(device, capability);
                    });
                });
                
            } catch (err) {
                resultsContainer.innerHTML = '<div class="error-message">Failed to load devices. Please try again.</div>';
            }
        }, 300));

        // Helper function to format capability names
        function formatCapabilityName(capability) {
            // Convert from camelCase/snake_case to Title Case with spaces
            return capability
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
        }

        // Load devices when the dialog opens
        document.getElementById('addDevice').addEventListener('click', async () => {
            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = '<div class="initial-state">Start typing to search for devices</div>';
            
            try {
                // Pre-load devices
                await loadHomeyDevices();
            } catch (err) {
                resultsContainer.innerHTML = '<div class="error-message">Failed to load devices. Please try again.</div>';
            }
        });
    }

    function closeNewFloorDialog() {
        document.getElementById('newFloorDialog').style.display = 'none';
        document.getElementById('floorName').value = '';
        document.getElementById('floorImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
    }

    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const saveButton = document.getElementById('saveNewFloor');
        saveButton.disabled = true;
        
        try {
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${e.target.result}">`;
                saveButton.disabled = false;
            };
            reader.onerror = function(e) {
                Homey.alert('Failed to load image');
                saveButton.disabled = false;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            Homey.alert('Failed to process image');
            saveButton.disabled = false;
        }
    }

    function renderFloorsList() {
        const list = document.getElementById('floorsList');
        const emptyState = document.getElementById('emptyState');
        
        if (!floors || floors.length === 0) {
            list.innerHTML = `
                <div id="emptyState" class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" class="empty-state-icon">
                        <path d="M14 6l-4.22 5.63 1.25 1.67L14 9.33 19 16h-8.46l-4.01-5.37L1 18h22L14 6zM5 16l1.52-2.03L8.04 16H5z"/>
                    </svg>
                    <h2 class="empty-state-title">Welcome to Space Homey!</h2>
                    <p class="empty-state-text">Create your first floor plan to start mapping your smart home devices</p>
                    <p class="empty-state-sub">Click the + button above to get started</p>
                </div>`;
            return;
        }

        list.innerHTML = floors.map(floor => `
            <div class="floor-card">
                <div class="floor-thumbnail">
                    <img src="${floor.imageData}" alt="${floor.name}">
                </div>
                <div class="floor-name">${floor.name}</div>
                <div class="floor-actions">
                    <button class="icon-button edit-button" onclick="editFloor('${floor.id}')" title="Edit Floor">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-button" onclick="deleteFloor('${floor.id}')" title="Delete Floor">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function saveFloors() {
        try {
            await Homey.set('floors', floors);
        } catch (err) {
            throw new Error('Failed to save: ' + err.message);
        }
    }

    // Make functions available globally for onclick handlers
    window.editFloor = async function(id) {
        currentFloorId = id; // Set current floor ID when editing
        const floor = floors.find(f => f.id === id);
        if (!floor) return;
        
        // Hide list view and show edit view
        document.getElementById('floorsListView').style.display = 'none';
        document.getElementById('floorEditView').style.display = 'block';
        
        // Populate edit view
        document.getElementById('editViewTitle').textContent = `Edit ${floor.name}`;
        document.getElementById('editFloorName').value = floor.name;
        document.getElementById('floorMapImage').src = floor.imageData;
        
        // Add event listener for the add device button
        document.getElementById('addDevice').addEventListener('click', () => {
            document.getElementById('deviceDialog').style.display = 'flex';
        });
        
        // Render existing devices
        renderDevicesList(floor.devices || []);
        renderFloorPlanDevices(floor);
    };

    window.deleteFloor = function(id) {
        if (!id) return;
        currentDeleteId = id;
        document.getElementById('deleteConfirmDialog').style.display = 'flex';
    };

    function renderDevicesList(devices) {
        const list = document.getElementById('devicesList');
        
        if (!list) {
            Homey.api('POST', '/log', { message: 'devicesList element not found!' }, () => {});
            return;
        }

        if (!devices || !devices.length) {
            list.innerHTML = `
                <div class="device-item" style="background: white; padding: 12px; text-align: center; color: #666;">
                    No devices added yet. Click the + button above to add devices.
                </div>
            `;
            return;
        }

        const html = devices.map(device => `
            <div class="device-item" style="background: white; padding: 12px; border-bottom: 1px solid #eee;">
                <div class="device-info">
                    <img src="${device.iconObj?.url || 'https://icons.homey.app/icons/light.svg'}" 
                         style="width: 24px; height: 24px;" 
                         alt="${device.name}">
                    <span>${device.name} (${device.capability || 'unknown'})</span>
                </div>
                <button class="icon-button delete-button" 
                        onclick="removeDevice('${device.id}')"
                        style="background: none; border: none; cursor: pointer;">
                    <svg width="20" height="20" viewBox="0 0 24 24" style="fill: #ff4444;">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
        `).join('');

        list.innerHTML = html;
    }

    function addDeviceToFloor(device, capability) {
        Homey.api('POST', '/log', { message: `Adding device: ${device.name} with capability: ${capability}` }, () => {});
        
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor) {
            Homey.api('POST', '/log', { message: 'No current floor found!' }, () => {});
            return;
        }

        // Create new device entry with default position in bottom right (but not too far)
        const newDevice = {
            id: `${device.id}-${capability}`,
            deviceId: device.id,
            name: device.name,
            capability: capability,
            iconObj: device.iconObj,
            position: {
                x: 85, // More comfortable bottom right position
                y: 85
            }
        };

        Homey.api('POST', '/log', { message: `New device object: ${JSON.stringify(newDevice)}` }, () => {});

        // Add to devices array if it doesn't exist
        if (!currentFloor.devices) {
            currentFloor.devices = [];
        }

        // Check if this device+capability combination already exists
        const exists = currentFloor.devices.some(d => d.id === newDevice.id);
        if (exists) {
            Homey.alert('This capability is already added for this device');
            return;
        }

        currentFloor.devices.push(newDevice);

        // Save floors
        saveFloors().then(() => {
            Homey.api('POST', '/log', { message: 'Floors saved successfully' }, () => {});
            
            // Update the floor plan display
            renderFloorPlanDevices(currentFloor);
            
            // Update the devices list
            renderDevicesList(currentFloor.devices);
            
            // Update the search results to show added state
            updateSearchResults();
            
            // Close the device dialog
            document.getElementById('deviceDialog').style.display = 'none';
        }).catch(err => {
            Homey.api('POST', '/log', { message: `Save error: ${err.message}` }, () => {});
            Homey.alert('Failed to save: ' + err.message);
        });
    }

    // Function to check if a device capability is already added
    function isDeviceCapabilityAdded(deviceId, capability) {
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor || !currentFloor.devices) return false;
        
        return currentFloor.devices.some(d => d.id === `${deviceId}-${capability}`);
    }

    // Update the search results rendering to show added state
    function updateSearchResults() {
        const searchTerm = document.getElementById('deviceSearch').value.toLowerCase().trim();
        if (!searchTerm) return;

        const filteredDevices = homeyDevices.filter(device => 
            device.name.toLowerCase().includes(searchTerm)
        );

        document.querySelectorAll('.add-capability-btn').forEach(button => {
            const deviceId = button.dataset.deviceId;
            const capability = button.dataset.capability;
            
            if (isDeviceCapabilityAdded(deviceId, capability)) {
                button.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                    </svg>
                `;
                button.disabled = true;
                button.classList.add('added');
            }
        });
    }

    // Function to render devices on floor plan
    function renderFloorPlanDevices(floor) {
        const container = document.getElementById('floorPlanDevices');
        container.innerHTML = '';
        
        Homey.api('POST', '/log', { message: `Rendering ${floor.devices.length} devices on floor plan` }, () => {});

        floor.devices.forEach(device => {
            const deviceEl = document.createElement('div');
            deviceEl.className = 'floor-plan-device';
            deviceEl.id = `device-${device.id}`;
            
            // Convert percentage positions to pixels
            const containerRect = container.getBoundingClientRect();
            const pixelX = (device.position.x / 100) * containerRect.width;
            const pixelY = (device.position.y / 100) * containerRect.height;
            
            deviceEl.style.transform = `translate(${pixelX}px, ${pixelY}px)`;
            
            deviceEl.innerHTML = `
                <img src="${device.iconObj?.url || 'default-icon.png'}" alt="${device.name}">
            `;

            deviceEl.addEventListener('touchstart', handleDragStart, { passive: false });
            
            container.appendChild(deviceEl);
        });
    }

    function handleDragStart(e) {
        e.preventDefault();
        Homey.api('POST', '/log', { message: 'Touch Start Event Triggered' }, () => {});
        
        const container = document.getElementById('floorPlanContainer');
        const containerRect = container.getBoundingClientRect();
        
        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        
        // Clear any existing dragging state first
        const existingDragging = document.querySelector('.dragging');
        if (existingDragging) {
            existingDragging.classList.remove('dragging');
        }
        
        e.target.classList.add('dragging');
        
        // Store the initial offset
        const deviceRect = e.target.getBoundingClientRect();
        e.target.dataset.offsetX = clientX - deviceRect.left;
        e.target.dataset.offsetY = clientY - deviceRect.top;
        
        // Add event listeners to document instead of container
        document.addEventListener('touchmove', handleDrag, { passive: false });
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('touchcancel', handleDragEnd);
    }

    function handleDrag(e) {
        e.preventDefault();

        const device = document.querySelector('.dragging');
        if (!device) return;
        
        const container = document.getElementById('floorPlanContainer');
        const containerRect = container.getBoundingClientRect();
        
        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        
        // Calculate position as percentages
        let percentX = ((clientX - containerRect.left) / containerRect.width) * 100;
        let percentY = ((clientY - containerRect.top) / containerRect.height) * 100;
        
        // Constrain to container bounds (accounting for device size)
        percentX = Math.max(0, Math.min(percentX, 100));
        percentY = Math.max(0, Math.min(percentY, 100));
        
        // Store percentages in dataset
        device.dataset.percentX = percentX;
        device.dataset.percentY = percentY;
        
        // Convert percentages to pixels for visual positioning
        const pixelX = (percentX / 100) * containerRect.width;
        const pixelY = (percentY / 100) * containerRect.height;
        
        device.style.transform = `translate(${pixelX}px, ${pixelY}px)`;
    }

    function handleDragEnd(e) {
        const device = document.querySelector('.dragging');
        if (!device) return;
        
        device.classList.remove('dragging');
        
        // Remove all event listeners
        document.removeEventListener('touchmove', handleDrag, { passive: false });
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('touchcancel', handleDragEnd);
        
        // Get final position as percentages
        const percentX = parseFloat(device.dataset.percentX || 0);
        const percentY = parseFloat(device.dataset.percentY || 0);
        
        // Update position in the floor data
        const deviceId = device.id.replace('device-', '');
        const currentFloor = floors.find(f => f.id === currentFloorId);
        const deviceData = currentFloor.devices.find(d => d.id === deviceId);
        
        if (deviceData) {
            deviceData.position = {
                x: percentX,
                y: percentY
            };
            saveFloors().catch(err => {
                Homey.alert('Failed to save device position: ' + err.message);
            });
        }
    }

    // Make removeDevice function available globally
    window.removeDevice = function(deviceId) {
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor) return;

        // Remove the device from the array
        currentFloor.devices = currentFloor.devices.filter(d => d.id !== deviceId);
        
        // First update UI immediately
        renderDevicesList(currentFloor.devices);
        renderFloorPlanDevices(currentFloor);

        // Then save to Homey
        saveFloors().then(() => {
            Homey.api('POST', '/log', { message: 'Device removed and saved successfully' }, () => {});
        }).catch(err => {
            Homey.api('POST', '/log', { message: `Error saving after device removal: ${err.message}` }, () => {});
            Homey.alert('Failed to save changes: ' + err.message);
            // If save fails, reload the original data
            loadFloors();
        });
    };

    // Initialize
    init();
    setupEventListeners();
} 