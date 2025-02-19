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
    console.log('Settings page loaded!');
    let floors = [];
    let homeyApi = null;
    let homeyDevices = []; // Store devices globally
    let currentFloorId = null; // Add this at the top with other state variables
    let currentDeleteId = null;

    // Add Floor Dialog Event Handlers
    function initializeFloorDialog() {
        const newFloorDialog = document.getElementById('newFloorDialog');
        if (!newFloorDialog) {
            console.error('New floor dialog not found');
            return;
        }

        const closeButton = newFloorDialog.querySelector('.close-button');
        const cancelButton = document.getElementById('cancelNewFloor');
        const saveButton = document.getElementById('saveNewFloor');
        const floorImage = document.getElementById('floorImage');
        const imagePreview = document.getElementById('imagePreview');
        const addFloorButton = document.getElementById('addFloor');

        // Add Floor button click handler
        if (addFloorButton) {
            addFloorButton.addEventListener('click', () => {
                newFloorDialog.style.display = 'flex';
            });
        }

        // Close button handler (X button)
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent any default behavior
                newFloorDialog.style.display = 'none';
                resetFloorDialog();
            });
        } else {
            console.error('Close button not found in new floor dialog');
        }

        // Cancel button handler
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                newFloorDialog.style.display = 'none';
                resetFloorDialog();
            });
        }

        // Save button handler
        if (saveButton) {
            saveButton.addEventListener('click', saveNewFloor);
        }

        // Image preview handler
        if (floorImage) {
            floorImage.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && imagePreview) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; height: auto;">`;
                    };
                    reader.readAsDataURL(file);
                } else if (imagePreview) {
                    imagePreview.innerHTML = '';
                }
            });
        }
    }

    // Reset floor dialog
    function resetFloorDialog() {
        const floorName = document.getElementById('floorName');
        const floorImage = document.getElementById('floorImage');
        const imagePreview = document.getElementById('imagePreview');

        if (floorName) floorName.value = '';
        if (floorImage) floorImage.value = '';
        if (imagePreview) imagePreview.innerHTML = '';
    }

    // Initialize
    async function init() {
        try {
            // First load the data
            await loadFloors();
            homeyDevices = await loadHomeyDevices();
            
            // Then initialize UI and event handlers
            await initializeDialogs();

            Homey.ready();
        } catch (err) {
            console.error('Initialization error:', err);
            Homey.alert(err.message || 'Failed to initialize');
        }
    }

    async function loadFloors() {
        const savedFloors = await Homey.get('floors');
        if (savedFloors) {
            floors = savedFloors;
            renderFloorsList();
        }
    }

    function setupDeleteDialog() {

        const deleteDialog = document.getElementById('deleteConfirmDialog');
        if (!deleteDialog) {
            console.error('Delete dialog not found');
            return;
        }

        const closeButton = deleteDialog.querySelector('.close-button');
        const cancelButton = document.getElementById('cancelDelete');
        const confirmButton = document.getElementById('confirmDelete');

        // Close button handler (X button)
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                deleteDialog.style.display = 'none';
                currentDeleteId = null;
            });
        } else {
            console.error('Close button not found in delete dialog');
        }

        // Cancel button handler
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                deleteDialog.style.display = 'none';
                currentDeleteId = null;
            });
        }

        // Confirm delete handler
        if (confirmButton) {
            confirmButton.addEventListener('click', async () => {
                if (!currentDeleteId) return;
                try {
                    confirmButton.disabled = true;
                    cancelButton.disabled = true;
                    confirmButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';

                    floors = floors.filter(f => f.id !== currentDeleteId);
                    await saveFloors();
                    deleteDialog.style.display = 'none';
                    renderFloorsList();
                } catch (err) {
                    console.error('Delete error:', err);
                    Homey.alert('Failed to delete floor plan');
                } finally {
                    confirmButton.disabled = false;
                    cancelButton.disabled = false;
                    confirmButton.innerHTML = 'Delete';
                    currentDeleteId = null;
                }
            });
        }
    }

    async function initializeDialogs() {

        try {
            initializeFloorDialog();
            setupDeleteDialog();
            setupDeviceDialog();
            setupEventListeners(); // Non-modal event listeners

        } catch (err) {
            console.error('Dialog initialization error:', err);
            throw err; // Re-throw to be caught by init()
        }
    }

    function setupEventListeners() {

        // Back to list only
        const backToList = document.getElementById('backToList');
        if (backToList) {
            backToList.addEventListener('click', () => {
                document.getElementById('floorEditView').style.display = 'none';
                document.getElementById('floorsListView').style.display = 'block';
            });
        }
    }

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
                <div class="floor-thumbnail"">
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

            return Promise.resolve();
        } catch (err) {
            return Promise.reject(new Error('Failed to save floors: ' + err.message));
        }
    }

    // Make functions available globally for onclick handlers
    window.editFloor = async function (id) {
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

    window.deleteFloor = function (id) {
        if (!id) return;
        currentDeleteId = id;
        document.getElementById('deleteConfirmDialog').style.display = 'flex';
    };

    function renderDevicesList(devices) {
        const list = document.getElementById('devicesList');

        if (!list) {
            return;
        }

        if (!devices || !devices.length) {
            list.innerHTML = `
                <div class="floor-device-wrapper">
                    <div class="floor-device-item" style="background: white; padding: 12px; text-align: center; color: #666;">
                     No devices added yet. Click the + button above to add devices.
                    </div>
                </div>
            `;
            return;
        }

        const sortedDevices = [...devices].sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        const html = sortedDevices.map(device => {
            // Determine the capability display text
            let capabilityText;
            if (device.capability === 'dim') {
                capabilityText = 'Dim';
            } else if (device.capability === 'onoff') {
                capabilityText = 'On/Off';
            } else if (device.capability === 'sensor') {
                capabilityText = 'Sensor';
            }

            return `
                <div class="floor-device-wrapper">
                    <div class="floor-device-item">
                        <button class="expand-button" onclick="toggleDeviceRules('${device.id}')">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#666" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                            </svg>
                        </button>
                        <div class="floor-device-info" onclick="highlightDevice('${device.id}')">
                            <span style="cursor: pointer;">${device.name} (${capabilityText})</span>
                        </div>
                        <button class="icon-button delete-button" onclick="removeDevice('${device.id}')">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#ff4444" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="floor-device-rules" id="rules-${device.id}" style="display: none;">
                        <div class="floor-rules-content">
                            ${device.rules && device.rules.length > 0
                    ? device.rules.map(rule => `
                                    <div class="floor-rule-item">
                                        <div class="floor-rule-info">
                                            <span>${rule.name}</span>
                                        </div>
                                        <div class="floor-rule-actions">
                                            <button class="rule-action-btn edit-rule" data-device-id="${device.id}" data-rule-id="${rule.id}">
                                                <svg width="20" height="20" viewBox="0 0 24 24">
                                                    <path fill="#666" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                                </svg>
                                            </button>
                                            <button class="rule-action-btn delete-rule" data-device-id="${device.id}" data-rule-id="${rule.id}">
                                                <svg width="20" height="20" viewBox="0 0 24 24">
                                                    <path fill="#666" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')
                    : '<p class="no-rules-message">No rules configured</p>'
                }
                            <button class="add-rule-button" onclick="addNewRule('${device.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path fill="#00a0dc" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                </svg>
                                Add Rule
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        list.innerHTML = html;

        // Re-add event listeners for rules
        list.querySelectorAll('.edit-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                editRule(deviceId, ruleId);
            });
        });

        list.querySelectorAll('.delete-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                deleteRule(deviceId, ruleId);
            });
        });
    }

    function addDeviceToFloor(device, capability) {
        const currentFloor = floors.find(f => f.id === currentFloorId);
        // Create new device entry
        const newDevice = {
            id: `${device.id}-${capability}`,
            deviceId: device.id,
            name: device.name,
            capability: capability,
            iconObj: device.iconObj,
            position: {
                x: 15,
                y: 15
            },
            rules: []
        };

        // Add default color rule for onoff and dim capabilities
        if (capability === 'onoff' || capability === 'dim') {
            newDevice.rules.push({
                id: Date.now().toString(),
                name: 'On/Off - Color Switcher',
                type: 'iconColor',
                config: {
                    onColor: '#ffeb3b',  // Yellow
                    offColor: '#ffffff'   // White
                }
            });
        }

        // Add default color rule for onoff and dim capabilities
        if (capability === 'alarm_contact' || capability === 'alarm_motion') {
            newDevice.rules.push({
                id: Date.now().toString(),
                name: 'On/Off - Color Switcher',
                type: 'iconColor',
                config: {
                    onColor: '#ff0000',  // Red
                    offColor: '#ffffff'   // White
                }
            });
        }

        // Special handling for sensors
        if (capability === 'alarm_contact' || capability === 'alarm_motion') {
            newDevice.id = `${device.id}-sensor-${capability}`;
            newDevice.capability = 'sensor';
            newDevice.sensorType = capability;
        }

        // Add to devices array if it doesn't exist
        if (!currentFloor.devices) {
            currentFloor.devices = [];
        }

        // Check if this device+capability combination already exists
        const exists = currentFloor.devices.some(d => d.id === newDevice.id);
        if (exists) {
            console.error(`Device already exists: ${newDevice.id}`);
            Homey.alert('This capability is already added for this device');
            return;
        }

        currentFloor.devices.push(newDevice);

        // Save floors
        saveFloors().then(() => {
            // Update the floor plan display
            renderFloorPlanDevices(currentFloor);

            // Update the devices list
            renderDevicesList(currentFloor.devices);

            // Update the search results to show added state
            updateSearchResults();

            // Close the device dialog
            document.getElementById('deviceDialog').style.display = 'none';
        }).catch(err => {
            console.error('Failed to save floors:', err);
            Homey.alert('Failed to save: ' + err.message);
        });
    }

    // Function to check if a device capability is already added
    function isDeviceCapabilityAdded(deviceId, capability) {
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor || !currentFloor.devices) return false;

        return currentFloor.devices.some(d => {
            if (d.deviceId === deviceId) {
                if (capability === 'alarm_contact' || capability === 'alarm_motion') {
                    return d.capability === 'sensor' && d.sensorType === capability;
                }
                return d.capability === capability;
            }
            return false;
        });
    }

    // Update the search results rendering
    function updateSearchResults(searchTerm, filteredDevices) {
        const resultsContainer = document.getElementById('searchResults');

        if (!searchTerm) {
            resultsContainer.innerHTML = '<div class="initial-state">Start typing to search for devices</div>';
            return;
        }

        if (filteredDevices.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No devices found</div>';
            return;
        }

        // Support sensor capabilities along with existing ones
        const supportedCapabilities = ['onoff', 'dim', 'alarm_contact', 'alarm_motion'];

        resultsContainer.innerHTML = filteredDevices.map(device => {
            const deviceCapabilities = device.capabilities || [];
            const supported = deviceCapabilities.filter(cap => supportedCapabilities.includes(cap));
            const unsupported = deviceCapabilities.filter(cap => !supportedCapabilities.includes(cap));

            return `
                <div class="device-item">
                    <div class="device-header">
                        <div class="device-icon">
                            <img src="${device.iconObj?.url || 'default-icon.png'}" alt="${device.name}">
                        </div>
                        <div class="device-name" title="${device.name}">${device.name}</div>
                    </div>
                    <div class="capabilities-section">
                        ${supported.map(capabilityId => {
                            let displayName = capabilityId;
                            if (capabilityId === 'dim') displayName = 'Dim (with On/Off)';
                            else if (capabilityId === 'onoff') displayName = 'On/Off';
                            else if (capabilityId === 'alarm_contact') displayName = 'Sensor (Contact)';
                            else if (capabilityId === 'alarm_motion') displayName = 'Sensor (Motion)';

                            const isAdded = isDeviceCapabilityAdded(device.id, capabilityId);
                            
                            return `
                                <div class="capability-row">
                                    <div class="capability-name">${displayName}</div>
                                    <button class="add-capability-btn ${isAdded ? 'added' : ''}" 
                                            data-device-id="${device.id}" 
                                            data-capability="${capabilityId}"
                                            ${isAdded ? 'disabled' : ''}>
                                        <span class="button-content">
                                            ${isAdded ? '✓' : '+'}
                                            <div class="spinner" style="display: none;"></div>
                                        </span>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${unsupported.length > 0 ? `
                        <div class="unsupported-capabilities">
                            Unsupported: ${unsupported.join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Add click handlers for capability buttons
        document.querySelectorAll('.add-capability-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', async function() {
                    const deviceId = this.dataset.deviceId;
                    const capability = this.dataset.capability;
                    const device = filteredDevices.find(d => d.id === deviceId);
                    
                    // Show spinner and disable button
                    const buttonContent = this.querySelector('.button-content');
                    const spinner = this.querySelector('.spinner');
                    const originalText = buttonContent.textContent;
                    buttonContent.textContent = '';
                    spinner.style.display = 'block';
                    this.disabled = true;

                    try {
                        await addDeviceToFloor(device, capability);
                        
                        // Close the dialog
                        document.getElementById('deviceDialog').style.display = 'none';
                        
                        // Refresh the devices list
                        const currentFloor = floors.find(f => f.id === currentFloorId);
                        if (currentFloor) {
                            renderDevicesList(currentFloor.devices);
                            renderFloorPlanDevices(currentFloor);
                        }

                    } catch (err) {
                        console.error('Failed to add device:', err);
                        Homey.alert('Failed to add device');
                        
                        // Reset button on error
                        buttonContent.textContent = originalText;
                        spinner.style.display = 'none';
                        this.disabled = false;
                    }
                });
            }
        });
    }

    // Function to render devices on floor plan
    function renderFloorPlanDevices(floor) {
        const container = document.getElementById('floorPlanDevices');
        const image = document.getElementById('floorMapImage');
        const wrapper = document.getElementById('imageWrapper');
        const parentContainer = wrapper.parentElement;

        container.innerHTML = '';

        // Wait for image to load to get correct dimensions
        if (!image.complete) {
            image.onload = () => renderFloorPlanDevices(floor);
            return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();

        // Store original dimensions for drag calculations
        container.dataset.originalWidth = image.naturalWidth;
        container.dataset.originalHeight = image.naturalHeight;

        // Add styles if not present
        if (!document.getElementById('floorPlanDeviceStyles')) {
            const styles = document.createElement('style');
            styles.id = 'floorPlanDeviceStyles';
            styles.textContent = `
                .floor-plan-device {
                    position: absolute;
                    width: 22px;
                    height: 22px;
                    background: rgba(255, 255, 255);
                    border-radius: 50%;
                    border: 2px dashed rgb(121, 120, 120, 0.90);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: move;
                    transition: all 0.2s ease;
                    transform-origin: center;
                }
                .floor-plan-device img {
                    width: 14px;
                    height: 14px;
                    pointer-events: none;
                }
                .floor-plan-device.dragging {
                    transform: scale(1.1);
                    z-index: 1000;
                }
                .floor-plan-device.highlight-device {
                    background: #ffd700;
                    box-shadow: 0 0 10px #ffd700;
                    transform: scale(1.2);
                    z-index: 1000;
                }
            `;
            document.head.appendChild(styles);
        }

        floor.devices.forEach(device => {
            const deviceEl = document.createElement('div');
            deviceEl.className = 'floor-plan-device';
            deviceEl.id = `device-${device.id}`;

            // Use percentages directly for positioning
            const displayX = (device.position.x / 100) * wrapperRect.width;
            const displayY = (device.position.y / 100) * wrapperRect.height;

            deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;

            deviceEl.innerHTML = `
                <img src="${device.iconObj?.url || 'default-icon.png'}" alt="${device.name}">
            `;

            deviceEl.addEventListener('touchstart', handleDragStart, { passive: false });
            deviceEl.addEventListener('mousedown', handleDragStart);

            container.appendChild(deviceEl);
        });
    }

    function handleDragStart(e) {
        e.preventDefault();
        const isTouchEvent = e.type === 'touchstart';
        const wrapper = document.getElementById('imageWrapper');
        const image = document.getElementById('floorMapImage');
        const wrapperRect = wrapper.getBoundingClientRect();

        // Store original image dimensions for calculations
        wrapper.dataset.originalWidth = image.naturalWidth;
        wrapper.dataset.originalHeight = image.naturalHeight;

        const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;

        const existingDragging = document.querySelector('.dragging');
        if (existingDragging) {
            existingDragging.classList.remove('dragging');
        }

        e.target.classList.add('dragging');

        // Store the initial offset
        const deviceRect = e.target.getBoundingClientRect();
        e.target.dataset.offsetX = clientX - deviceRect.left;
        e.target.dataset.offsetY = clientY - deviceRect.top;

        if (isTouchEvent) {
            document.addEventListener('touchmove', handleDrag, { passive: false });
            document.addEventListener('touchend', handleDragEnd);
            document.addEventListener('touchcancel', handleDragEnd);
        } else {
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', handleDragEnd);
        }
    }

    function handleDrag(e) {
        e.preventDefault();
        const isTouchEvent = e.type === 'touchmove';

        const device = document.querySelector('.dragging');
        if (!device) return;

        const wrapper = document.getElementById('imageWrapper');
        const wrapperRect = wrapper.getBoundingClientRect();

        const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;

        // Calculate position relative to imageWrapper
        let relativeX = clientX - wrapperRect.left;
        let relativeY = clientY - wrapperRect.top;

        // Constrain to wrapper bounds
        relativeX = Math.max(0, Math.min(relativeX, wrapperRect.width));
        relativeY = Math.max(0, Math.min(relativeY, wrapperRect.height));

        // Calculate percentage position relative to wrapper
        const percentX = (relativeX / wrapperRect.width) * 100;
        const percentY = (relativeY / wrapperRect.height) * 100;

        // Store coordinates in dataset
        device.dataset.originalX = percentX;
        device.dataset.originalY = percentY;

        // Update visual position
        device.style.transform = `translate(${relativeX}px, ${relativeY}px)`;
    }

    function handleDragEnd(e) {
        const device = document.querySelector('.dragging');
        if (!device) return;

        device.classList.remove('dragging');

        // Remove event listeners
        document.removeEventListener('touchmove', handleDrag, { passive: false });
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('touchcancel', handleDragEnd);
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);

        // Get position in original image coordinates
        const originalX = parseFloat(device.dataset.originalX);
        const originalY = parseFloat(device.dataset.originalY);

        // Update position in the floor data
        const deviceId = device.id.replace('device-', '');
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor) {
            Homey.alert('Error: Could not find current floor');
            return;
        }

        const deviceData = currentFloor.devices.find(d => d.id === deviceId);
        if (!deviceData) {
            Homey.alert('Error: Could not find device data');
            return;
        }

        // Update the position in the device data
        deviceData.position = {
            x: originalX,
            y: originalY
        };

        // Find and update the floor in the main floors array
        const floorIndex = floors.findIndex(f => f.id === currentFloorId);
        if (floorIndex !== -1) {
            floors[floorIndex] = currentFloor;
        }

        // Save floors
        saveFloors()
            .then(() => {

            })
            .catch(err => {
                console.error('Failed to save floors:', err);
                Homey.alert('Failed to save device position: ' + err.message);
                renderFloorPlanDevices(currentFloor);
            });
    }

    // Make removeDevice function available globally
    window.removeDevice = function (deviceId) {
        // Create and show delete confirmation modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-content';

        modal.innerHTML = `
            <div class="modal-header">
                <h2>Delete Device</h2>
                <button class="close-button">×</button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to remove this device from the floor plan?</p>
            </div>
            <div class="modal-footer">
                <button class="button button-secondary cancel-button">Cancel</button>
                <button class="button button-danger confirm-delete">Delete</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add event listeners for the modal buttons
        const closeButton = modal.querySelector('.close-button');
        const cancelButton = modal.querySelector('.cancel-button');
        const confirmButton = modal.querySelector('.confirm-delete');

        const closeModal = () => {
            document.body.removeChild(overlay);
        };

        closeButton.addEventListener('click', closeModal);
        cancelButton.addEventListener('click', closeModal);

        confirmButton.addEventListener('click', async () => {
            // Disable buttons and show loading state
            confirmButton.disabled = true;
            cancelButton.disabled = true;
            confirmButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';

            try {
                const currentFloor = floors.find(f => f.id === currentFloorId);
                if (!currentFloor) throw new Error('Current floor not found');

                // Remove the device
                currentFloor.devices = currentFloor.devices.filter(d => d.id !== deviceId);
                await saveFloors();
                
                // Update the UI
                renderDevicesList(currentFloor.devices);
                renderFloorPlanDevices(currentFloor);
                closeModal();
                
                // Show success message
                Homey.alert('Device removed successfully!', 'success');
            } catch (err) {
                console.error('Failed to remove device:', err);
                Homey.alert('Failed to remove device');
            } finally {
                confirmButton.disabled = false;
                cancelButton.disabled = false;
                confirmButton.innerHTML = 'Delete';
            }
        });
    };

    // Make this function available globally
    window.toggleDeviceRules = function (deviceId) {
        const rulesSection = document.getElementById(`rules-${deviceId}`);
        const expandButton = rulesSection.previousElementSibling.querySelector('.expand-button');

        if (rulesSection.style.display === 'none') {
            rulesSection.style.display = 'block';
            expandButton.classList.add('expanded');
        } else {
            rulesSection.style.display = 'none';
            expandButton.classList.remove('expanded');
        }
    };

    window.addNewRule = function (deviceId) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-content';

        // Initial rule selection view
        modal.innerHTML = `
            <div class="modal-header">
                <h2>Add New Rule</h2>
                <button class="close-button">×</button>
            </div>
            <div class="modal-body">
                <div class="rule-type-selector">
                    <label>Select Rule Type</label>
                    <select id="ruleTypeSelect">
                        <option value="">Choose a rule type...</option>
                        <option value="allColor">All - Static Color</option>
                        <option value="iconColor">On/Off - Color Switcher</option>
                        <option value="imageView">On/Off - Image Switcher</option>
                        <option value="iconSelect">All - Icon Select</option>
                    </select>
                </div>
                <div id="ruleConfig" class="rule-config">
                    <!-- Rule configuration will be dynamically loaded here -->
                </div>
            </div>
            <div class="modal-footer">
                <button class="button button-secondary cancel-button">Cancel</button>
                <button class="button button-primary save-button" disabled>Save Rule</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setupRuleEventListeners(overlay, deviceId);
    };

    function setupRuleEventListeners(overlay, deviceId, ruleId = null) {
        const ruleTypeSelect = document.getElementById('ruleTypeSelect');
        const ruleConfig = document.getElementById('ruleConfig');
        const saveButton = overlay.querySelector('.save-button');
        const cancelButton = overlay.querySelector('.cancel-button');
        const closeButton = overlay.querySelector('.close-button');

        // Handle image upload if this is an imageView rule
        const imageInput = document.getElementById('ruleImage');
        if (imageInput) {
            imageInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const img = new Image();
                        img.onload = function () {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');

                            // Set maximum dimensions
                            const MAX_WIDTH = 800;
                            const MAX_HEIGHT = 600;

                            let width = img.width;
                            let height = img.height;

                            // Calculate new dimensions while maintaining aspect ratio
                            if (width > MAX_WIDTH) {
                                height = Math.round((height * MAX_WIDTH) / width);
                                width = MAX_WIDTH;
                            }
                            if (height > MAX_HEIGHT) {
                                width = Math.round((width * MAX_HEIGHT) / height);
                                height = MAX_HEIGHT;
                            }

                            canvas.width = width;
                            canvas.height = height;

                            // Clear canvas and draw image
                            ctx.clearRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);

                            // Convert to PNG to preserve transparency
                            const imageData = canvas.toDataURL('image/png');

                            // Update preview
                            const preview = document.getElementById('ruleImagePreview');
                            preview.innerHTML = `
                                <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                                    <img src="${imageData}" style="width: 100%; height: auto; object-fit: contain;">
                                </div>
                            `;
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                } catch (err) {
                    console.error('Failed to process image:', err);
                    Homey.alert('Failed to process image: ' + err.message);
                }
            });
        }

        // Close modal handlers
        const closeModal = () => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };

        [closeButton, cancelButton].forEach(button => {
            button.addEventListener('click', closeModal);
        });

        saveButton.addEventListener('click', async () => {
            // Disable buttons and show loading state
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

            try {
                const currentFloor = floors.find(f => f.id === currentFloorId);
                if (!currentFloor) throw new Error('Current floor not found');

                const device = currentFloor.devices.find(d => d.id === deviceId);
                if (!device) throw new Error('Device not found');

                // Get the rule configuration based on type
                const ruleType = ruleTypeSelect.value;
                if (!ruleType) throw new Error('Please select a rule type');

                let config = {};

                if (ruleType === 'iconColor') {
                    config = {
                        onColor: document.getElementById('onColor').value,
                        offColor: document.getElementById('offColor').value
                    };
                } else if (ruleType === 'allColor') {
                    config = {
                        mainColor: document.getElementById('mainColor').value
                    };
                } else if (ruleType === 'imageView') {
                    // Get current preview image
                    const previewImg = document.getElementById('ruleImagePreview').querySelector('img');
                    const imageData = previewImg ? previewImg.src : null;

                    // If editing and no new image uploaded, keep existing image
                    if (!imageData && ruleId) {
                        const existingRule = device.rules.find(r => r.id === ruleId);
                        config.imageData = existingRule.config.imageData;
                    } else {
                        config.imageData = imageData;
                    }

                    config.onStateVisibility = document.getElementById('onStateVisibility').value;
                    config.offStateVisibility = document.getElementById('offStateVisibility').value;
                } else if (ruleType === 'iconSelect') {
                    // Implement icon selection logic
                    config = {
                        selectedIcon: document.getElementById('selectedIcon').value
                    };
                }

                // Initialize rules array if it doesn't exist
                if (!device.rules) {
                    device.rules = [];
                }

                if (ruleId) {
                    // Update existing rule
                    const ruleIndex = device.rules.findIndex(r => r.id === ruleId);
                    if (ruleIndex === -1) throw new Error('Rule not found');

                    device.rules[ruleIndex] = {
                        ...device.rules[ruleIndex],
                        config
                    };
                } else {
                    // Add new rule
                    const newRule = {
                        id: Date.now().toString(),
                        type: ruleType,
                        name: getRuleName(ruleType),
                        config
                    };
                    device.rules.push(newRule);
                }

                // Save changes
                await saveFloors();
                renderDeviceRules(deviceId);
                closeModal();
            } catch (err) {
                console.error('Failed to save rule:', err);

                Homey.alert('Failed to save rule: ' + err.message);

                // Reset button states on error
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.innerHTML = 'Save Changes';
                }
                if (cancelButton) {
                    cancelButton.disabled = false;
                }
            }
        });

        // Handle rule type selection
        ruleTypeSelect.addEventListener('change', function () {
            const ruleType = this.value;
            if (!ruleType) {
                ruleConfig.innerHTML = '';
                saveButton.disabled = true;
                return;
            }

            // Show configuration based on rule type
            if (ruleType === 'iconColor') {
                ruleConfig.innerHTML = `
                    <div class="color-picker-group">
                        <div class="color-input-group">
                            <label>On Color</label>
                            <input type="color" id="onColor" value="#00ff00">
                        </div>
                        <div class="color-input-group">
                            <label>Off Color</label>
                            <input type="color" id="offColor" value="#ff0000">
                        </div>
                    </div>
                `;
            } else if (ruleType === 'allColor') {
                ruleConfig.innerHTML = `
                    <div class="color-picker-group">
                        <div class="color-input-group">
                            <label>Color</label>
                            <input type="color" id="mainColor" value="#00ff00">
                        </div>
                    </div>
                `;
            } else if (ruleType === 'imageView') {
                const currentFloor = floors.find(f => f.id === currentFloorId);
                const device = currentFloor.devices.find(d => d.id === deviceId);
                const existingRule = ruleId ? device.rules.find(r => r.id === ruleId) : null;

                ruleConfig.innerHTML = `
                    <div class="image-rule-config">
                        <div class="image-upload-group">
                            <label>Image</label>
                            <input type="file" id="ruleImage" accept="image/*" class="homey-form-input">
                        </div>
                        <div id="ruleImagePreview" class="image-preview">
                            ${existingRule?.config?.imageData ? `<img src="${existingRule.config.imageData}">` : ''}
                        </div>
                        <div class="visibility-options">
                            <div class="visibility-group">
                                <label>On State</label>
                                <select id="onStateVisibility" class="homey-form-input">
                                 <option value="hide" ${existingRule?.config?.onStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                    <option value="show" ${existingRule?.config?.onStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                   
                                </select>
                            </div>
                            <div class="visibility-group">
                                <label>Off State</label>
                                <select id="offStateVisibility" class="homey-form-input">
                                  <option value="show" ${existingRule?.config?.offStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                    <option value="hide" ${existingRule?.config?.offStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                  
                                </select>
                            </div>
                        </div>
                    </div>
                `;

                // Add image upload handler
                const imageInput = document.getElementById('ruleImage');
                const preview = document.getElementById('ruleImagePreview');

                imageInput.addEventListener('change', (e) => {
                    handleRuleImageUpload(e, 'ruleImagePreview');
                });
            } else if (ruleType === 'iconSelect') {
                ruleConfig.innerHTML = `
                    <div class="icon-search-section">
                        <div class="search-container">
                            <label for="iconSearch" class="search-label">Search Icons</label>
                            <input type="text" id="iconSearch" class="homey-form-input" placeholder="Type to search...">
                        </div>
                        <div id="iconSearchResults" class="icon-results">
                            <div class="initial-state">Type to search for icons</div>
                        </div>
                    </div>
                `;

                // Add icon search functionality
                const searchInput = document.getElementById('iconSearch');
                const resultsContainer = document.getElementById('iconSearchResults');
                let icons = null;

                // Load icons.json
                fetch('./assets/icons.json')
                    .then(response => response.json())
                    .then(data => {
                        icons = data;
                    })
                    .catch(err => {
                        console.error('Failed to load icons:', err);
                        resultsContainer.innerHTML = 'Failed to load icons';
                    });

                // Add search handler with debounce
                searchInput.addEventListener('input', debounce(async (e) => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    
                    if (searchTerm.length < 2) {
                        resultsContainer.innerHTML = '<div class="initial-state">Type at least 2 characters to search</div>';
                        return;
                    }

                    if (!icons) {
                        resultsContainer.innerHTML = 'Loading icons...';
                        return;
                    }

                    // Search through icons
                    const matches = Object.entries(icons)
                        .filter(([name, data]) => 
                            name.toLowerCase().includes(searchTerm) ||
                            data.search?.terms?.some(term => term.toLowerCase().includes(searchTerm))
                        )
                        .slice(0, 3); // Limit to 3 results

                    if (matches.length === 0) {
                        resultsContainer.innerHTML = '<div class="no-results">No icons found</div>';
                        return;
                    }

                    // Display results
                    resultsContainer.innerHTML = matches.map(([name, data]) => {
                        const svgData = data.svg?.solid || data.svg?.regular;
                        const stylesCount = data.styles.length;
                        const stylesText = stylesCount > 1 ? ` (${stylesCount} styles)` : '';
                        
                        return `
                            <div class="icon-result" data-icon-name="${name}">
                                <div class="icon-preview">
                                    ${svgData ? `
                                        <svg xmlns="http://www.w3.org/2000/svg" 
                                             viewBox="0 0 ${data.width || 512} ${data.height || 512}" 
                                             width="24" 
                                             height="24">
                                            <path d="${svgData.path}" fill="currentColor"/>
                                        </svg>
                                    ` : '(no icon)'}
                                </div>
                                <div class="icon-name">${name}${stylesText}</div>
                            </div>
                        `;
                    }).join('');

                    // Add click handlers for icon selection
                    resultsContainer.querySelectorAll('.icon-result').forEach(result => {
                        result.addEventListener('click', function() {
                            const iconName = this.dataset.iconName;
                            const iconData = icons[iconName];
                            
                            // Clear previous results and show selection
                            resultsContainer.innerHTML = '';
                            
                            // Show selected icon with style selector
                            const selectedSection = document.createElement('div');
                            selectedSection.className = '';
                            
                            // Only show style selector if there are multiple styles
                            const hasMultipleStyles = iconData.styles.length > 1;
                            
                            selectedSection.innerHTML = `
                                <label class="selected-label">Selected Icon</label>
                                <div class="selection-content">
                                    <h4>${iconName}</h4>
                                    
                                    ${hasMultipleStyles ? `
                                        <div class="style-box">
                                            <label>Style Options</label>
                                            <select class="style-select">
                                                ${iconData.styles.map(style => `
                                                    <option value="${style}">${style.charAt(0).toUpperCase() + style.slice(1)}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                    ` : ''}
                                    
                                    <div class="preview-box">
                                        <label>Icon Preview</label>
                                        <div class="preview-content">
                                            <svg xmlns="http://www.w3.org/2000/svg" 
                                                 viewBox="0 0 ${iconData.width || 512} ${iconData.height || 512}" 
                                                 width="32" 
                                                 height="32">
                                                <path d="${iconData.svg.solid.path}" fill="currentColor"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            `;

                            resultsContainer.appendChild(selectedSection);

                            // Add style change handler
                            if (hasMultipleStyles) {
                                const styleSelect = selectedSection.querySelector('.style-select');
                                styleSelect.addEventListener('change', function() {
                                    const selectedStyle = this.value;
                                    const previewSvg = selectedSection.querySelector('.preview-content svg path');
                                    previewSvg.setAttribute('d', iconData.svg[selectedStyle].path);
                                });
                            }

                            // Store selected icon data
                            ruleConfig.dataset.selectedIcon = JSON.stringify({
                                name: iconName,
                                style: hasMultipleStyles ? selectedSection.querySelector('.style-select').value : iconData.styles[0],
                                ...iconData
                            });

                            // Enable save button
                            document.querySelector('.save-button').disabled = false;
                        });
                    });
                }, 300));

                // Update the styles
                if (!document.getElementById('iconSearchStyles')) {
                    const styles = document.createElement('style');
                    styles.id = 'iconSearchStyles';
                    styles.textContent = `
                        .modal-content {
                            max-height: 90vh;
                            display: flex;
                            flex-direction: column;
                        }
                        
                        .modal-header {
                            flex: 0 0 auto;
                            border-bottom: 1px solid #ddd;
                        }
                        
                        .modal-body {
                            flex: 1;
                            overflow-y: auto;
                            padding: 20px;
                            /* Remove any border that might appear on the scrollable area */
                            border: none;
                        }
                        
                        .modal-footer {
                            flex: 0 0 auto;
                            border-top: 1px solid #ddd;
                        }
                        
                        .icon-search-section {
                            padding: 10px 0;
                        }
                        
                        .search-label, .selected-label {
                            display: block;
                            font-weight: 500;
                            margin-bottom: 8px;
                            color: #333;
                        }
                        
                        .icon-results {
                            margin-top: 10px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            overflow: hidden;
                        }
                        
                        .icon-result {
                            display: flex;
                            align-items: center;
                            padding: 8px 12px;
                            cursor: pointer;
                            border-bottom: 1px solid #ddd;
                        }
                        
                        .icon-result:last-child {
                            border-bottom: none;
                        }
                        
                        .icon-result:hover {
                            background: #f5f5f5;
                        }
                        
                        .icon-preview {
                            width: 30px;
                            height: 30px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-right: 12px;
                        }
                        
                        .icon-preview svg {
                            width: 20px;
                            height: 20px;
                            color: #333;
                        }
                        
                        .selected-section {
                            margin-top: 15px;
                            border: none;
                            padding: 0;
                        }
                        
                        .selected-label {
                            display: block;
                            font-weight: 500;
                            margin-bottom: 8px;
                            color: #333;
                            border: none;
                            background: none;
                        }
                        
                        .selection-content {
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            padding: 15px;
                            margin: 0;
                        }

                        /* Ensure no default form fieldset borders */
                        .modal-body fieldset,
                        .rule-config fieldset {
                            border: none;
                            padding: 0;
                            margin: 0;
                        }
                    `;
                    document.head.appendChild(styles);
                }
            }
            saveButton.disabled = false;
        });
    }

    function handleRuleImageUpload(e, previewId) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Use same max dimensions as floor images
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;

                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                if (height > MAX_HEIGHT) {
                    width = Math.round((width * MAX_HEIGHT) / height);
                    height = MAX_HEIGHT;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const imageData = canvas.toDataURL('image/png');

                // Update preview
                const preview = document.getElementById(previewId);
                preview.innerHTML = `
                    <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                        <img src="${imageData}" style="width: 100%; height: auto; object-fit: contain;">
                    </div>`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Helper function to get rule name based on type
    function getRuleName(ruleType) {
        switch (ruleType) {
            case 'iconColor':
                return 'On/Off - Color Switcher';
            case 'allColor':
                return 'All - Static Color';
            case 'imageView':
                return 'On/Off - Image Switcher';
            case 'iconSelect':  // Add new type
                return 'All - Icon Select';
            default:
                return 'Custom Rule';
        }
    }

    // Add CSS for the spinner
    const style = document.createElement('style');
    style.textContent = `
        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: inline-block;
            vertical-align: middle;
            margin-left: 4px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .button-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .add-capability-btn {
            min-width: 32px;
        }
    `;
    document.head.appendChild(style);

    // Make functions available globally
    window.editRule = function (deviceId, ruleId) {
        // Add debug logging


        const currentFloor = floors.find(f => f.id === currentFloorId);
        const device = currentFloor.devices.find(d => d.id === deviceId);
        const rule = device.rules.find(r => r.id === ruleId);


        if (!rule) {
            Homey.alert('Rule not found');
            return;
        }

        // Create and show modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-content';

        // Pre-populate the rule type and configuration
        modal.innerHTML = `
            <div class="modal-header">
                <h2>Edit Rule</h2>
                <button class="close-button">×</button>
            </div>
            <div class="modal-body">
                <div class="rule-type-selector">
                    <label>Rule Type</label>
                    <select id="ruleTypeSelect" disabled>
                        <option value="allColor" ${rule.type === 'allColor' ? 'selected' : ''}>All - Static Color</option>
                        <option value="iconColor" ${rule.type === 'iconColor' ? 'selected' : ''}>On/Off - Color Switcher</option>
                        <option value="imageView" ${rule.type === 'imageView' ? 'selected' : ''}>On/Off - Image Switcher</option>
                    </select>
                </div>
                <div id="ruleConfig" class="rule-config">
                    ${rule.type === 'iconColor' ? `
                        <div class="color-picker-group">
                            <div class="color-input-group">
                                <label>On Color</label>
                                <input type="color" id="onColor" value="${rule.config.onColor || '#00ff00'}">
                            </div>
                            <div class="color-input-group">
                                <label>Off Color</label>
                                <input type="color" id="offColor" value="${rule.config.offColor || '#ff0000'}">
                            </div>
                        </div>
                    ` : rule.type === 'allColor' ? `
                        <div class="color-picker-group">
                            <div class="color-input-group">
                                <label>Color</label>
                                <input type="color" id="mainColor" value="${rule.config.mainColor || '#00ff00'}">
                            </div>
                        </div>
                    ` : rule.type === 'imageView' ? `
                        <div class="image-rule-config">
                            <div class="image-upload-group">
                                <label>Image</label>
                                <input type="file" id="ruleImage" accept="image/*" class="homey-form-input">
                            </div>
                            <div id="ruleImagePreview" class="image-preview">
                                ${rule.config.imageData ? `
                                    <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                                        <img src="${rule.config.imageData}" style="width: 100%; height: auto; object-fit: contain;">
                                    </div>
                                ` : ''}
                            </div>
                            <div class="visibility-options">
                                <div class="visibility-group">
                                    <label>On State</label>
                                    <select id="onStateVisibility" class="homey-form-input">
                                        <option value="show" ${rule.config.onStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                        <option value="hide" ${rule.config.onStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                    </select>
                                </div>
                                <div class="visibility-group">
                                    <label>Off State</label>
                                    <select id="offStateVisibility" class="homey-form-input">
                                        <option value="show" ${rule.config.offStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                        <option value="hide" ${rule.config.offStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="modal-footer">
                <button class="button button-secondary cancel-button">Cancel</button>
                <button class="button button-primary save-button">Save Changes</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add event listeners
        const saveButton = modal.querySelector('.save-button');
        const cancelButton = modal.querySelector('.cancel-button');
        const closeButton = modal.querySelector('.close-button');

        const closeModal = () => {
            document.body.removeChild(overlay);
        };

        closeButton.addEventListener('click', closeModal);
        cancelButton.addEventListener('click', closeModal);

        saveButton.addEventListener('click', async () => {
            // Disable buttons and show loading state
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

            try {
                // Your existing save logic here
                await saveFloors();
                renderDeviceRules(deviceId);
                closeModal();
            } catch (err) {
                Homey.alert('Failed to save rule: ' + err.message);
                // Reset button states on error
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.innerHTML = 'Save Changes';
            }
        });

        setupRuleEventListeners(overlay, deviceId, ruleId);


    };

    window.deleteRule = function (deviceId, ruleId) {
        // Create and show delete confirmation modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-content';

        modal.innerHTML = `
            <div class="modal-header">
                <h2>Delete Rule</h2>
                <button class="close-button">×</button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to delete this rule?</p>
            </div>
            <div class="modal-footer">
                <button class="button button-secondary cancel-button">Cancel</button>
                <button class="button button-danger confirm-delete">Delete</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add event listeners for the modal buttons
        const closeButton = modal.querySelector('.close-button');
        const cancelButton = modal.querySelector('.cancel-button');
        const confirmButton = modal.querySelector('.confirm-delete');

        const closeModal = () => {
            document.body.removeChild(overlay);
        };

        closeButton.addEventListener('click', closeModal);
        cancelButton.addEventListener('click', closeModal);

        confirmButton.addEventListener('click', async () => {
            // Disable buttons and show loading state
            confirmButton.disabled = true;
            cancelButton.disabled = true;
            confirmButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';

            try {
                const currentFloor = floors.find(f => f.id === currentFloorId);
                if (!currentFloor) throw new Error('Current floor not found');

                const device = currentFloor.devices.find(d => d.id === deviceId);
                if (!device) throw new Error('Device not found');

                // Remove the rule
                device.rules = device.rules.filter(r => r.id !== ruleId);
                await saveFloors();
                
                // Update the UI
                renderDeviceRules(deviceId);
                closeModal();
                
                // Show success message
                Homey.alert('Rule deleted successfully!', 'success');
            } catch (err) {
                console.error('Failed to delete rule:', err);
                Homey.alert('Failed to delete rule');
            } finally {
                confirmButton.disabled = false;
                cancelButton.disabled = false;
                confirmButton.innerHTML = 'Delete';
            }
        });
    };

    // Add this new function for device highlighting
    window.highlightDevice = function (deviceId) {
        // Remove highlight from all devices first
        document.querySelectorAll('.floor-plan-device').forEach(device => {
            device.classList.remove('highlight-device');
        });

        // Add highlight to the selected device
        const deviceElement = document.getElementById(`device-${deviceId}`);
        if (deviceElement) {
            deviceElement.classList.add('highlight-device');

            // Remove highlight after 2 seconds
            setTimeout(() => {
                deviceElement.classList.remove('highlight-device');
            }, 2000);
        }
    };

    // Add this new function to render just the rules for a specific device
    function renderDeviceRules(deviceId) {
        const currentFloor = floors.find(f => f.id === currentFloorId);
        if (!currentFloor) return;

        const device = currentFloor.devices.find(d => d.id === deviceId);
        if (!device) return;

        const rulesSection = document.getElementById(`rules-${deviceId}`);
        if (!rulesSection) return;

        rulesSection.innerHTML = `
            <div class="floor-rules-content">
                ${device.rules && device.rules.length > 0
                ? device.rules.map(rule => `
                        <div class="floor-rule-item">
                            <div class="floor-rule-info">
                                <span>${rule.name}</span>
                            </div>
                            <div class="floor-rule-actions">
                                <button class="rule-action-btn edit-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}">
                                    <svg width="20" height="20" viewBox="0 0 24 24">
                                        <path fill="#666" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                    </svg>
                                </button>
                                <button class="rule-action-btn delete-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}">
                                    <svg width="20" height="20" viewBox="0 0 24 24">
                                        <path fill="#666" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join('')
                : '<p class="no-rules-message">No rules configured</p>'
            }
                <button class="add-rule-button" onclick="addNewRule('${deviceId}')">
                    <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#00a0dc" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    Add Rule
                </button>
            </div>
        `;

        // Re-add event listeners for the new buttons
        rulesSection.querySelectorAll('.edit-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                editRule(deviceId, ruleId);
            });
        });

        rulesSection.querySelectorAll('.delete-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                deleteRule(deviceId, ruleId);
            });
        });

        // Keep the section expanded
        rulesSection.style.display = 'block';
    }

    function saveNewFloor() {
        const floorName = document.getElementById('floorName');
        const floorImage = document.getElementById('floorImage');
        const saveButton = document.getElementById('saveNewFloor');
        const cancelButton = document.getElementById('cancelNewFloor');

        if (!floorName || !floorImage || !floorImage.files[0]) {
            Homey.alert('Please provide both a name and an image');
            return;
        }

        // Disable buttons during save
        saveButton.disabled = true;
        cancelButton.disabled = true;
        saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = async function() {
                try {
                    // Create canvas for resizing
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // More conservative width, maintain max height
                    const MAX_WIDTH = 500;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    // Calculate scale factor based on both constraints
                    const scaleWidth = MAX_WIDTH / width;
                    const scaleHeight = MAX_HEIGHT / height;
                    const scale = Math.min(1, scaleWidth, scaleHeight); // Never upscale
                    
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);

                    // Set canvas dimensions
                    canvas.width = width;
                    canvas.height = height;

                    // Enable image smoothing for better quality
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Clear the canvas and maintain transparency
                    ctx.clearRect(0, 0, width, height);

                    // Draw resized image
                    ctx.drawImage(img, 0, 0, width, height);

                    // Get image data as PNG to preserve transparency
                    const imageData = canvas.toDataURL('image/png');

                    const newFloor = {
                        id: Date.now().toString(),
                        name: floorName.value,
                        imageData: imageData,
                        devices: []
                    };

                    // Add to floors array
                    floors.push(newFloor);

                    // Save to Homey settings
                    await saveFloors();

                    // Update the UI
                    renderFloorsList();

                    // Close and reset the dialog
                    document.getElementById('newFloorDialog').style.display = 'none';
                    resetFloorDialog();

                    // Show success message
                    Homey.alert('Floor plan created successfully!', 'success');
                } catch (err) {
                    console.error('Failed to save new floor:', err);
                    Homey.alert('Failed to save: ' + err.message);
                } finally {
                    // Reset button states
                    saveButton.disabled = false;
                    cancelButton.disabled = false;
                    saveButton.innerHTML = 'Create Floor';
                }
            };
            img.src = e.target.result;
        };

        reader.readAsDataURL(floorImage.files[0]);
    }

    function initializeDeviceDialog() {

        const searchInput = document.getElementById('deviceSearch');
        const searchResults = document.getElementById('searchResults');

        if (!searchInput || !searchResults) {
            console.error('Search elements not found:', { searchInput, searchResults });
            return;
        }

        searchInput.addEventListener('input', async function(e) {
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


                // Get devices from Homey and convert to array
                const devicesObj = await Homey.api('GET', '/devices');
                const devices = Object.values(devicesObj);


                // Filter devices
                const filteredDevices = devices.filter(device => {
                    const deviceName = (device.name || '').toLowerCase();
                    const zoneName = (device.zone && device.zone.name || '').toLowerCase();
                    const matches = deviceName.includes(searchTerm) || zoneName.includes(searchTerm);

                    return matches;
                });


                if (filteredDevices.length === 0) {
                    searchResults.innerHTML = '<div class="no-results">No devices found</div>';
                    return;
                }

                updateSearchResults(searchTerm, filteredDevices);

            } catch (err) {
                console.error('Search error:', err);
                console.error('Error stack:', err.stack);
                searchResults.innerHTML = '<div class="error-state">Error searching devices: ' + err.message + '</div>';
            }
        });
    }

    function setupDeviceDialog() {

        const addDeviceBtn = document.getElementById('addDevice');
        const deviceDialog = document.getElementById('deviceDialog');
        const closeButton = deviceDialog.querySelector('.close-button');
        const cancelButton = document.getElementById('cancelDeviceDialog');

        if (!addDeviceBtn || !deviceDialog || !closeButton || !cancelButton) {
            console.error('Required elements not found:', { 
                addDeviceBtn, deviceDialog, closeButton, cancelButton 
            });
            return;
        }

        addDeviceBtn.addEventListener('click', () => {

            deviceDialog.style.display = 'flex';
            document.getElementById('deviceSearch').value = '';
            document.getElementById('searchResults').innerHTML = 
                '<div class="initial-state">Start typing to search devices</div>';
        });

        const closeDialog = () => {

            deviceDialog.style.display = 'none';
        };

        closeButton.addEventListener('click', closeDialog);
        cancelButton.addEventListener('click', closeDialog);

        initializeDeviceDialog();
    }


    init();
    setupEventListeners();
} 