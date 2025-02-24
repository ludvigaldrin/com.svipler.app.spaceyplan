const floorManager = {
    Homey: null,
    floors: [],
    currentFloorId: null,
    ruleManager: null,

    async initialize(Homey) {
        if (!Homey) {
            throw new Error('Homey instance is required');
        }
        this.Homey = Homey;
        
        // Initialize RuleManager
        this.ruleManager = ruleManager;
        this.ruleManager.initialize(Homey, this);
        
        // Load floors
        await this.loadFloors();
        
        // Attach add floor button listener
        const addFloorBtn = document.getElementById('addFloor');
        if (addFloorBtn) {
            addFloorBtn.addEventListener('click', () => this.showAddFloorDialog());
        }
    },

    setupEventListeners() {
        // Add Floor button click handler
        const addFloorButton = document.getElementById('addFloor');
        if (addFloorButton) {
            addFloorButton.addEventListener('click', () => {
                this.showAddFloorDialog();
            });
        }

        // Floor dialog close/cancel handlers
        const floorDialog = document.getElementById('floorDialog');
        const closeButton = floorDialog.querySelector('.modal-close-button');
        const cancelButton = document.getElementById('cancelFloor');
        const saveButton = document.getElementById('saveFloor');
        const imageInput = document.getElementById('floorImage');
        const imagePreview = document.getElementById('imagePreview');

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                floorDialog.style.display = 'none';
                this.resetFloorDialog();
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                floorDialog.style.display = 'none';
                this.resetFloorDialog();
            });
        }

        if (saveButton) {
            // Remove any existing event listeners
            saveButton.replaceWith(saveButton.cloneNode(true));
            const newSaveButton = document.getElementById('saveFloor');
            newSaveButton.addEventListener('click', () => this.handleSaveFloor());
        }

        // Image preview handler
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && imagePreview) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; height: auto;">`;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    },

    resetFloorDialog() {
        const nameInput = document.getElementById('floorName');
        const imageInput = document.getElementById('floorImage');
        const imagePreview = document.getElementById('imagePreview');

        if (nameInput) nameInput.value = '';
        if (imageInput) imageInput.value = '';
        if (imagePreview) imagePreview.innerHTML = '';
    },

    async loadFloors() {
        try {
            if (!this.Homey) {
                throw new Error('Homey not initialized');
            }
            const storedFloors = await this.Homey.get('floors');
            this.floors = storedFloors || [];
            this.renderFloorsList();
        } catch (err) {
            console.error('Failed to load floors:', err);
            this.floors = [];
            throw err;
        }
    },

    renderFloorsList() {
        const floorsList = document.getElementById('floorsList');
        const emptyState = document.getElementById('emptyState');

        if (!this.floors || this.floors.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (floorsList) floorsList.innerHTML = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (floorsList) {
            floorsList.innerHTML = this.floors.map(floor => `
                <div class="floor-card" data-floor-id="${floor.id}">
                    <div class="floor-thumbnail">
                        <img src="${floor.imageData}" alt="${floor.name}">
                    </div>
                    <div class="floor-info">
                        <h3>${floor.name}</h3>
                        <div class="floor-actions">
                            <button class="edit-floor" data-floor-id="${floor.id}">Edit</button>
                            <button class="delete-floor" data-floor-id="${floor.id}">Delete</button>
                        </div>
                    </div>
                </div>
            `).join('');
            this.attachFloorEventListeners();
        }
    },

    renderFloorCard(floor) {
        return `
            <div class="floor-card">
                <div class="floor-thumbnail">
                    <img src="${floor.imageData}" alt="${floor.name}">
                </div>
                <div class="floor-name">${floor.name}</div>
                <div class="floor-actions">
                    <button class="icon-button edit-button" data-floor-id="${floor.id}" title="Edit Floor">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-button" data-floor-id="${floor.id}" title="Delete Floor">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    },

    attachFloorEventListeners() {
        const floorsList = document.getElementById('floorsList');
        if (!floorsList) return;

        // Edit floor handlers
        floorsList.querySelectorAll('.edit-floor').forEach(button => {
            button.addEventListener('click', () => {
                const floorId = button.dataset.floorId;
                this.editFloor(floorId);
            });
        });

        // Delete floor handlers
        floorsList.querySelectorAll('.delete-floor').forEach(button => {
            button.addEventListener('click', () => {
                const floorId = button.dataset.floorId;
                this.showDeleteFloorDialog(floorId);
            });
        });
    },

    editFloor(floorId) {
        this.currentFloorId = floorId;
        const floor = this.floors.find(f => f.id === floorId);
        if (!floor) return;

        // Hide list view and show edit view
        document.getElementById('floorsListView').style.display = 'none';
        document.getElementById('floorEditView').style.display = 'block';

        // Update UI
        document.getElementById('editViewTitle').textContent = `Edit ${floor.name}`;
        document.getElementById('editFloorName').value = floor.name;
        document.getElementById('floorMapImage').src = floor.imageData;

        // Render devices list
        this.renderDevicesList(floor.devices || []);
        this.renderFloorPlanDevices(floor.devices || []);

        // Add back button handler
        const backButton = document.getElementById('backToList');
        if (backButton) {
            backButton.onclick = () => this.backToFloorsList();
        }

        // Trigger onEditFloor callback
        if (this.onEditFloor) {
            this.onEditFloor(floorId);
        }
    },

    backToFloorsList() {
        // Hide edit view and show list view
        document.getElementById('floorEditView').style.display = 'none';
        document.getElementById('floorsListView').style.display = 'block';
        
        // Reset current floor ID
        this.currentFloorId = null;
        
        // Re-render floors list to ensure it's up to date
        this.renderFloorsList();
    },

    async saveFloors() {
        try {
            if (!this.Homey) {
                throw new Error('Homey not initialized');
            }
            await this.Homey.set('floors', this.floors);
        } catch (err) {
            console.error('Error saving floors:', err);
            throw err;
        }
    },

    // Add Floor Dialog
    showAddFloorDialog() {
        const dialog = document.getElementById('floorDialog');
        const titleElement = dialog.querySelector('#floorDialogTitle');
        const saveButton = dialog.querySelector('#saveFloor');
        const cancelButton = dialog.querySelector('#cancelFloor');
        const closeButton = dialog.querySelector('.modal-close-button');
        const imageInput = document.getElementById('floorImage');
        const imagePreview = document.getElementById('imagePreview');

        // Reset form
        this.resetFloorDialog();

        // Add image preview handler
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
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

        if (titleElement) titleElement.textContent = 'Add New Floor';
        if (saveButton) {
            saveButton.textContent = 'Add Floor';
            saveButton.onclick = () => this.handleSaveFloor();
        }

        // Add cancel and close button handlers
        if (cancelButton) {
            cancelButton.onclick = () => {
                dialog.style.display = 'none';
                this.resetFloorDialog();
            };
        }
        if (closeButton) {
            closeButton.onclick = () => {
                dialog.style.display = 'none';
                this.resetFloorDialog();
            };
        }

        dialog.style.display = 'flex';
    },

    saveNewFloor() {
        const nameInput = document.getElementById('floorName');
        const imageInput = document.getElementById('floorImage');
        const saveButton = document.getElementById('saveFloor');
        const cancelButton = document.getElementById('cancelFloor');

        if (!nameInput.value || !imageInput.files[0]) {
            this.Homey.alert('Please provide both a name and an image');
            return;
        }

        saveButton.disabled = true;
        cancelButton.disabled = true;
        saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = async () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const MAX_WIDTH = 500;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const imageData = canvas.toDataURL('image/png');
                    const newFloor = {
                        id: Date.now().toString(),
                        name: nameInput.value.trim(),
                        image: imageData,
                        devices: []
                    };

                    this.floors.push(newFloor);
                    await this.saveFloors();
                    this.renderFloorsList();
                    document.getElementById('floorDialog').style.display = 'none';
                    this.resetFloorDialog();
                    
                    this.Homey.alert('Floor plan created successfully!', 'success');
                } catch (err) {
                    console.error('Failed to save floor:', err);
                    this.Homey.alert('Failed to save: ' + err.message);
                } finally {
                    saveButton.disabled = false;
                    cancelButton.disabled = false;
                    saveButton.innerHTML = 'Create Floor';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(imageInput.files[0]);
    },

    // Delete Floor
    showDeleteFloorDialog(floorId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            console.error('Delete confirmation dialog not found');
            return;
        }

        // Update dialog text for floor deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Delete Floor';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to delete this floor plan? This action cannot be undone.';

        // Show dialog
        dialog.style.display = 'flex';

        // Handle delete
        const handleDelete = async () => {
            try {
                this.floors = this.floors.filter(f => f.id !== floorId);
                await this.saveFloors();
                this.renderFloorsList();
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to delete floor:', err);
                this.Homey.alert('Failed to delete floor');
            }
        };

        // Event listeners
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (confirmBtn) confirmBtn.onclick = handleDelete;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    },

    renderDevicesList(devices) {
        const list = document.getElementById('devicesList');
        if (!list) return;

        if (!devices || devices.length === 0) {
            list.innerHTML = `
                <div class="empty-devices-state">
                    <svg width="48" height="48" viewBox="0 0 24 24">
                        <path fill="#666" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    <h3>No devices added yet</h3>
                    <p>Click the + button above to add your first device to this floor plan</p>
                </div>`;
            return;
        }

        const sortedDevices = [...devices].sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );

        list.innerHTML = sortedDevices.map(device => {
            let capabilityText = device.capability;
            if (device.capability === 'dim') {
                capabilityText = 'Dim';
            } else if (device.capability === 'onoff') {
                capabilityText = 'On/Off';
            } else if (device.capability === 'sensor') {
                capabilityText = device.sensorType === 'alarm_motion' ? 'Motion' : 'Contact';
            }

            return `
                <div class="floor-device-wrapper">
                    <div class="floor-device-item">
                        <button class="expand-button" data-device-id="${device.id}">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#666" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                            </svg>
                        </button>
                        <div class="floor-device-info" data-device-id="${device.id}">
                            <span style="cursor: pointer;">${device.name} (${capabilityText})</span>
                        </div>
                        <button class="delete-button" data-device-id="${device.id}">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#ff4444" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="device-rules" id="rules-${device.id}" style="display: none;">
                        <div class="rules-content">
                            ${this.renderDeviceRules(device)}
                        </div>
                    </div>
                </div>`;
        }).join('');

        // Add event listeners
        list.querySelectorAll('.expand-button').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                const isExpanded = rulesSection.style.display !== 'none';
                
                // Toggle arrow direction
                const arrow = button.querySelector('svg');
                arrow.style.transform = isExpanded ? '' : 'rotate(180deg)';
                
                // Toggle rules section
                rulesSection.style.display = isExpanded ? 'none' : 'block';
            });
        });

        // Existing event listeners for delete and highlight
        list.querySelectorAll('.delete-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const deviceId = button.dataset.deviceId;
                this.removeDevice(deviceId);
            });
        });

        list.querySelectorAll('.floor-device-info').forEach(info => {
            info.addEventListener('click', () => {
                const deviceId = info.dataset.deviceId;
                this.highlightDevice(deviceId);
            });
        });

        // Add rule button listeners
        list.querySelectorAll('.add-rule-button').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                this.addRule(deviceId);
            });
        });
    },

    renderDeviceRules(device) {
        const rulesContent = this.ruleManager.renderRules(device);
        return `
            <div class="floor-device-rules">
                <div class="floor-rules-content">
                    ${rulesContent}
                </div>
            </div>`;
    },

    attachRuleEventListeners(element) {
        element.querySelectorAll('.edit-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                this.ruleManager.editRule(deviceId, ruleId);
            });
        });

        element.querySelectorAll('.delete-rule').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                this.ruleManager.deleteRule(deviceId, ruleId);
            });
        });

        element.querySelectorAll('.add-rule-row').forEach(row => {
            row.addEventListener('click', () => {
                const deviceId = row.dataset.deviceId;
                this.ruleManager.addRule(deviceId);
            });
        });
    },

    renderFloorPlanDevices(devices) {
        const container = document.getElementById('floorPlanDevices');
        const image = document.getElementById('floorMapImage');
        const wrapper = document.getElementById('imageWrapper');
        const parentContainer = wrapper.parentElement;

        container.innerHTML = '';

        // Wait for image to load to get correct dimensions
        if (!image.complete) {
            image.onload = () => this.renderFloorPlanDevices(devices);
            return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();

        // Store original dimensions for drag calculations
        container.dataset.originalWidth = image.naturalWidth;
        container.dataset.originalHeight = image.naturalHeight;

        devices.forEach(device => {
            const deviceElement = document.createElement('div');
            deviceElement.className = 'floor-plan-device';
            deviceElement.id = `device-${device.id}`;

            // Use percentages directly for positioning
            deviceElement.style.left = `${device.position.x}%`;
            deviceElement.style.top = `${device.position.y}%`;

            const icon = document.createElement('img');
            icon.src = device.iconObj ? device.iconObj.url : '';
            icon.alt = device.name;
            deviceElement.appendChild(icon);

            let isDragging = false;
            let currentX;
            let currentY;

            const dragStart = (e) => {
                if (e.type === 'touchstart') {
                    e.preventDefault();  // Prevent default touch behavior
                    e.stopPropagation(); // Stop event from bubbling up
                    
                    // Use first touch point
                    const touch = e.touches[0];
                    e.clientX = touch.clientX;
                    e.clientY = touch.clientY;
                }

                isDragging = true;
                deviceElement.classList.add('dragging');

                const rect = deviceElement.getBoundingClientRect();
                const wrapperRect = wrapper.getBoundingClientRect();
                
                // Calculate offset relative to wrapper
                const offsetX = (e.type === 'touchstart' ? e.touches[0].clientX : e.clientX) - rect.left;
                const offsetY = (e.type === 'touchstart' ? e.touches[0].clientY : e.clientY) - rect.top;
                
                deviceElement.dataset.offsetX = offsetX;
                deviceElement.dataset.offsetY = offsetY;
            };

            const drag = (e) => {
                if (!isDragging) return;
                
                if (e.type === 'touchmove') {
                    e.preventDefault();  // Prevent scrolling
                    e.stopPropagation();
                    
                    // Use first touch point
                    const touch = e.touches[0];
                    e.clientX = touch.clientX;
                    e.clientY = touch.clientY;
                }

                const wrapperRect = wrapper.getBoundingClientRect();
                const offsetX = parseFloat(deviceElement.dataset.offsetX);
                const offsetY = parseFloat(deviceElement.dataset.offsetY);

                // Calculate new position
                let newX = ((e.clientX - wrapperRect.left - offsetX) / wrapperRect.width) * 100;
                let newY = ((e.clientY - wrapperRect.top - offsetY) / wrapperRect.height) * 100;

                // Clamp values
                newX = Math.max(0, Math.min(100, newX));
                newY = Math.max(0, Math.min(100, newY));

                deviceElement.style.left = `${newX}%`;
                deviceElement.style.top = `${newY}%`;

                currentX = newX;
                currentY = newY;
            };

            const dragEnd = async () => {
                if (!isDragging) return;
                isDragging = false;
                deviceElement.classList.remove('dragging');

                const floor = this.floors.find(f => f.id === this.currentFloorId);
                if (!floor) return;

                const deviceToUpdate = floor.devices.find(d => d.id === device.id);
                if (!deviceToUpdate) return;

                deviceToUpdate.position = {
                    x: currentX,
                    y: currentY
                };

                try {
                    await this.saveFloors();
                } catch (err) {
                    console.error('Failed to save device position:', err);
                    this.Homey.alert('Failed to save device position');
                    this.renderFloorPlanDevices(floor.devices);
                }
            };

            deviceElement.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            deviceElement.addEventListener('touchstart', dragStart, { passive: false });
            document.addEventListener('touchmove', drag, { passive: false });
            document.addEventListener('touchend', dragEnd);

            container.appendChild(deviceElement);
        });
    },

    removeDevice(deviceId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            console.error('Delete confirmation dialog not found');
            return;
        }

        // Update dialog text for device deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Remove Device';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to remove this device from the floor plan?';

        // Show dialog
        dialog.style.display = 'flex';

        const handleDelete = async () => {
            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (!floor) return;

            // Remove device from floor
            floor.devices = floor.devices.filter(d => d.id !== deviceId);

            try {
                await this.saveFloors();
                this.renderDevicesList(floor.devices);
                this.renderFloorPlanDevices(floor.devices);
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to remove device:', err);
                this.Homey.alert('Failed to remove device');
            }
        };

        // Event listeners
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        
        if (confirmBtn) confirmBtn.onclick = handleDelete;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
    },

    highlightDevice(deviceId) {
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
    },

    async handleSaveFloor() {
        const dialog = document.getElementById('floorDialog');
        const nameInput = dialog.querySelector('#floorName');
        const imageInput = dialog.querySelector('#floorImage');
        const saveButton = dialog.querySelector('#saveFloor');
        const cancelButton = dialog.querySelector('#cancelFloor');

        if (!nameInput.value || !imageInput.files[0]) {
            this.Homey.alert('Please provide both a name and an image');
            return;
        }

        // Disable buttons during save
        saveButton.disabled = true;
        cancelButton.disabled = true;
        saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

        try {
            const file = imageInput.files[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const img = new Image();
                
                img.onload = async () => {
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
                            name: nameInput.value.trim(),
                            imageData: imageData,
                            devices: []
                        };

                        this.floors.push(newFloor);
                        await this.saveFloors();
                        this.renderFloorsList();
                        dialog.style.display = 'none';
                        this.resetFloorDialog();

                    } catch (err) {
                        console.error('Failed to save floor:', err);
                        this.Homey.alert('Failed to save: ' + err.message);
                    } finally {
                        saveButton.disabled = false;
                        cancelButton.disabled = false;
                        saveButton.innerHTML = 'Create Floor';
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Failed to read image:', err);
            this.Homey.alert('Failed to read image: ' + err.message);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        }
    },

    deleteRule(deviceId, ruleId) {
        const dialog = document.getElementById('deleteRuleDialog');
        if (!dialog) {
            console.error('Delete rule dialog not found');
            return;
        }

        // Show dialog
        dialog.style.display = 'flex';

        const handleDelete = async () => {
            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (!floor) return;

            const device = floor.devices.find(d => d.id === deviceId);
            if (!device) return;

            // Remove rule from device
            device.rules = device.rules.filter(r => r.id !== ruleId);

            try {
                await this.saveFloors();
                // Update just the rules section
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderDeviceRules(device);
                        // Re-attach event listeners for the new rule buttons
                        rulesContent.querySelectorAll('.delete-rule').forEach(button => {
                            button.addEventListener('click', () => {
                                const deviceId = button.dataset.deviceId;
                                const ruleId = button.dataset.ruleId;
                                this.deleteRule(deviceId, ruleId);
                            });
                        });
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to delete rule:', err);
                this.Homey.alert('Failed to delete rule');
            }
        };

        // Event listeners
        const confirmBtn = document.getElementById('confirmDeleteRule');
        const cancelBtn = document.getElementById('cancelDeleteRule');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (confirmBtn) confirmBtn.onclick = handleDelete;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    },

    addRule(deviceId) {
        this.ruleManager.addRule(deviceId);
    },

    editRule(deviceId, ruleId) {
        const dialog = document.getElementById('ruleDialog');
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) return;

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) return;

        const rule = device.rules.find(r => r.id === ruleId);
        if (!rule) return;

        // Update dialog title and button text
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        if (titleElement) titleElement.textContent = 'Edit Rule';
        if (saveButton) saveButton.textContent = 'Save Changes';

        // Populate form with existing rule data
        const nameInput = dialog.querySelector('#ruleName');
        const typeSelect = dialog.querySelector('#ruleType');
        const onColorInput = dialog.querySelector('#onColor');
        const offColorInput = dialog.querySelector('#offColor');

        if (nameInput) nameInput.value = rule.name;
        if (typeSelect) typeSelect.value = rule.type;
        if (onColorInput) onColorInput.value = rule.config.onColor;
        if (offColorInput) offColorInput.value = rule.config.offColor;

        // Show dialog
        dialog.style.display = 'flex';

        const handleSave = async () => {
            // Update rule with new values
            rule.name = nameInput.value;
            rule.type = typeSelect.value;
            rule.config = {
                onColor: onColorInput.value,
                offColor: offColorInput.value
            };

            try {
                await this.saveFloors();
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderDeviceRules(device);
                        this.attachRuleEventListeners(rulesContent);
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to save rule:', err);
                this.Homey.alert('Failed to save rule');
            }
        };

        // Event listeners
        const saveBtn = dialog.querySelector('#saveRule');
        const cancelBtn = dialog.querySelector('#cancelRule');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (saveBtn) saveBtn.onclick = handleSave;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    }
};

// Export for global access
window.floorManager = floorManager; 