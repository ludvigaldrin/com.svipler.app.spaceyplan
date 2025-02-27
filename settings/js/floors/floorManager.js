const floorManager = {
    Homey: null,
    floors: [],
    currentFloorId: null,
    ruleManager: null,

    async initialize(Homey) {
        this.Homey = Homey;
        
        // Attach add floor button handler
        const addFloorButton = document.getElementById('addFloor');
        if (addFloorButton) {
            addFloorButton.onclick = () => this.showAddFloorDialog();
        }

        this.loadFloors();
        this.ruleManager = ruleManager;
        this.ruleManager.init(this, Homey);
    },

    async loadFloors() {
        const savedFloors = await this.Homey.get('floors');
        if (savedFloors) {
            this.floors = savedFloors;
            this.renderFloorsList();
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
        const editView = document.getElementById('floorEditView');
        editView.style.display = 'block';

        // Enable scrolling on mobile
        editView.style.overflowY = 'auto';
        editView.style.height = '100%';
        editView.style.maxHeight = '100vh';
        editView.style.position = 'absolute';
        editView.style.left = '0';
        editView.style.right = '0';
        editView.style.top = '0';
        editView.style.bottom = '0';
        editView.style.webkitOverflowScrolling = 'touch';

        // Make devices list scrollable
        const devicesList = document.getElementById('devicesList');
        if (devicesList) {
            devicesList.style.overflowY = 'auto';
            devicesList.style.maxHeight = '40vh';
        }

        // Update UI
        document.getElementById('editViewTitle').textContent = `Edit ${floor.name}`;
        document.getElementById('editFloorName').value = floor.name;
        document.getElementById('floorMapImage').src = floor.imageData;

        // Add event listener for floor name changes
        const nameInput = document.getElementById('editFloorName');
        if (nameInput) {
            // Remove any existing event listeners
            const newNameInput = nameInput.cloneNode(true);
            nameInput.parentNode.replaceChild(newNameInput, nameInput);
            
            // Add input event listener
            newNameInput.addEventListener('change', () => {
                this.updateFloorName(floorId, newNameInput.value);
            });
        }

        // Render devices list
        this.renderDevicesList(floor.devices || []);
        this.renderFloorPlanDevices(floor);

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

    // Add new method to update floor name
    async updateFloorName(floorId, newName) {
        if (!newName || newName.trim() === '') {
            this.Homey.alert('Floor name cannot be empty');
            return;
        }

        const floor = this.floors.find(f => f.id === floorId);
        if (!floor) return;

        // Update floor name
        floor.name = newName.trim();
        
        // Update title
        const titleElement = document.getElementById('editViewTitle');
        if (titleElement) {
            titleElement.textContent = `Edit ${floor.name}`;
        }

        try {
            // Save changes
            await this.saveFloors();
        } catch (err) {
            console.error('Failed to update floor name:', err);
            this.Homey.alert('Failed to update floor name: ' + err.message);
        }
    },

    backToFloorsList() {
        // Reset edit view styles
        const editView = document.getElementById('floorEditView');
        if (editView) {
            editView.style.display = 'none';
            // Reset the styles we added for mobile scrolling
            editView.style.position = '';
            editView.style.height = '';
            editView.style.maxHeight = '';
            editView.style.left = '';
            editView.style.right = '';
            editView.style.top = '';
            editView.style.bottom = '';
            editView.style.overflowY = '';
        }
        
        // Show list view
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
            
            // Validate floors data before saving
            if (!this.floors) {
                console.error('Floors array is undefined');
                throw new Error('Invalid floors data');
            }
            
            // Make sure we're passing a valid array
            const floorsToSave = Array.isArray(this.floors) ? this.floors : [];
            
            // Ensure each floor has required properties
            const validFloors = floorsToSave.map(floor => {
                // Create a clean floor object with all required properties
                return {
                    id: floor.id || Date.now().toString(),
                    name: floor.name || 'Unnamed Floor',
                    imageData: floor.imageData || '',
                    devices: Array.isArray(floor.devices) ? floor.devices : []
                };
            });
            
            // Update the floors array with validated data
            this.floors = validFloors;
            
            // Save to Homey
            await this.Homey.set('floors', validFloors);
        } catch (err) {
            console.error('Error saving floors:', err);
            throw err;
        }
    },

    // Add Floor Dialog
    showAddFloorDialog() {
        const dialog = document.getElementById('floorDialog');
        if (!dialog) {
            console.error('Floor dialog not found');
            return;
        }

        // Reset form
        const nameInput = dialog.querySelector('#floorName');
        const imageInput = dialog.querySelector('#floorImage');
        const saveButton = dialog.querySelector('#saveFloor');
        const previewImage = dialog.querySelector('#imagePreview');
        const closeButton = dialog.querySelector('.modal-close-button');
        const cancelButton = dialog.querySelector('#cancelFloor');

        // Clear previous values
        if (nameInput) nameInput.value = '';
        if (imageInput) imageInput.value = '';
        if (previewImage) previewImage.innerHTML = '';
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Create Floor';
            saveButton.onclick = () => this.saveNewFloor();
        }

        // Setup image preview
        if (imageInput) {
            imageInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file && previewImage) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewImage.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; height: auto;">`;
                        if (saveButton && nameInput.value) {
                            saveButton.disabled = false;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        // Setup name input validation
        if (nameInput) {
            nameInput.oninput = () => {
                if (saveButton) {
                    saveButton.disabled = !(nameInput.value && imageInput.files.length > 0);
                }
            };
        }

        // Setup close handlers
        if (closeButton) {
            closeButton.onclick = () => {
                dialog.style.display = 'none';
            };
        }
        if (cancelButton) {
            cancelButton.onclick = () => {
                dialog.style.display = 'none';
            };
        }

        // Show dialog
        dialog.style.display = 'flex';
    },

    async saveNewFloor() {
        const dialog = document.getElementById('floorDialog');
        const nameInput = dialog.querySelector('#floorName');
        const imageInput = dialog.querySelector('#floorImage');
        const saveButton = dialog.querySelector('#saveFloor');
        const cancelButton = dialog.querySelector('#cancelFloor');

        if (!nameInput?.value || !imageInput?.files[0]) {
            this.Homey.alert('Please provide both a name and an image');
            return;
        }

        try {
            // Disable buttons and show loading state
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

            // Read the image file
            const file = imageInput.files[0];
            const reader = new FileReader();

            reader.onload = async (e) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        // Create canvas for image processing
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Reduce dimensions for compression
                        const MAX_WIDTH = 500;
                        const MAX_HEIGHT = 800;
                        
                        // Calculate dimensions
                        let { width, height } = img;
                        const scaleWidth = MAX_WIDTH / width;
                        const scaleHeight = MAX_HEIGHT / height;
                        const scale = Math.min(1, scaleWidth, scaleHeight);

                        width = Math.floor(width * scale);
                        height = Math.floor(height * scale);

                        // Set canvas size
                        canvas.width = width;
                        canvas.height = height;

                        // Draw image with smoothing
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.clearRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);

                        // Determine if the image has transparency
                        let hasTransparency = false;
                        
                        // Check file type first
                        const fileType = file.type.toLowerCase();
                        if (fileType === 'image/png' || fileType === 'image/webp' || fileType === 'image/gif') {
                            // These formats support transparency, so we'll check for it
                            // Get image data to check for transparency
                            const imageData = ctx.getImageData(0, 0, width, height);
                            const data = imageData.data;
                            
                            // Check if any pixel has alpha < 255 (not fully opaque)
                            for (let i = 3; i < data.length; i += 4) {
                                if (data[i] < 255) {
                                    hasTransparency = true;
                                    break;
                                }
                            }
                        }
                        
                        // Use appropriate format based on transparency
                        let processedImageData;
                        if (hasTransparency) {
                            // Use PNG for images with transparency
                            processedImageData = canvas.toDataURL('image/png', 0.7);
                        } else {
                            // Use JPEG for images without transparency (better compression)
                            processedImageData = canvas.toDataURL('image/jpeg', 0.8);
                        }

                        // Create new floor object
                        const newFloor = {
                            id: Date.now().toString(),
                            name: nameInput.value.trim(),
                            imageData: processedImageData,
                            devices: []
                        };

                        // Add to floors array and save
                        this.floors.push(newFloor);
                        await this.saveFloors();
                        
                        // Update UI
                        this.renderFloorsList();
                        
                        // Close and reset dialog
                        dialog.style.display = 'none';
                        this.resetFloorDialog();
                        

                    } catch (err) {
                        console.error('Failed to process and save floor:', err);
                        this.Homey.alert('Failed to save floor: ' + err.message);
                    } finally {
                        // Reset button states
                        saveButton.disabled = false;
                        cancelButton.disabled = false;
                        saveButton.innerHTML = 'Create Floor';
                    }
                };
                img.src = e.target.result;
            };

            reader.readAsDataURL(file);

        } catch (err) {
            console.error('Failed to save floor:', err);
            this.Homey.alert('Failed to save floor: ' + err.message);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        }
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

        // Get buttons
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        // Store original confirm button text
        const originalBtnText = confirmBtn.innerHTML;

        // Handle delete
        const handleDelete = async () => {
            try {
                // Show loading state
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                if (closeBtn) closeBtn.disabled = true;
                
                // Add spinner and loading text
                confirmBtn.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';
                
                // Delete the floor
                this.floors = this.floors.filter(f => f.id !== floorId);
                await this.saveFloors();
                
                // Update UI
                this.renderFloorsList();
                
                // Close dialog
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to delete floor:', err);
                this.Homey.alert('Failed to delete floor: ' + err.message);
            } finally {
                // Reset button states
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;
            }
        };

        // Event listeners
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

        // Add expand button listeners
        list.querySelectorAll('.expand-button').forEach(button => {
            button.addEventListener('click', () => {
                const deviceId = button.dataset.deviceId;
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const isHidden = rulesSection.style.display === 'none';
                    rulesSection.style.display = isHidden ? 'block' : 'none';
                    if (isHidden) {
                        this.attachRuleEventListeners(rulesSection);
                    }
                }
            });
        });

        // Add other listeners
        list.querySelectorAll('.delete-button').forEach(button => {
            button.addEventListener('click', (e) => {
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
        element.querySelectorAll('.delete-rule').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                this.deleteRule(deviceId, ruleId);
            });
        });

        element.querySelectorAll('.edit-rule').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                this.ruleManager.editRule(deviceId, ruleId);
            });
        });

        element.querySelectorAll('.add-rule-row').forEach(row => {
            row.addEventListener('click', () => {
                const deviceId = row.dataset.deviceId;
                this.ruleManager.addRule(deviceId);
            });
        });
    },

    renderFloorPlanDevices(floor) {
        const container = document.getElementById('floorPlanDevices');
        const image = document.getElementById('floorMapImage');
        const wrapper = document.getElementById('imageWrapper');

        container.innerHTML = '';

        // Add required CSS styles for container and wrapper
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 200;
        `;

        wrapper.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // Wait for image to load
        if (!image.complete) {
            image.onload = () => this.renderFloorPlanDevices(floor);
            return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();

        floor.devices.forEach(device => {
            const deviceEl = document.createElement('div');
            deviceEl.className = 'floor-plan-device';
            deviceEl.id = `device-${device.id}`;
            deviceEl.setAttribute('data-name', device.name);

            // Position relative to wrapper
            const displayX = (device.position.x / 100) * wrapperRect.width;
            const displayY = (device.position.y / 100) * wrapperRect.height;
            
            deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
            deviceEl.style.left = '0';
            deviceEl.style.top = '0';

            // Create icon wrapper for consistent styling
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'icon-wrapper';
            const img = document.createElement('img');
            img.src = device.iconObj?.url || 'default-icon.png';
            img.alt = device.name;
            iconWrapper.appendChild(img);
            deviceEl.appendChild(iconWrapper);

            // Add event listeners
            deviceEl.addEventListener('touchstart', this.handleDragStart.bind(this), { passive: false });
            deviceEl.addEventListener('mousedown', this.handleDragStart.bind(this));

            container.appendChild(deviceEl);
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

        // Get buttons
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        // Store original confirm button text
        const originalBtnText = confirmBtn.innerHTML;

        const handleDelete = async () => {
            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (!floor) return;

            try {
                // Show loading state
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                if (closeBtn) closeBtn.disabled = true;
                
                // Add spinner and loading text
                confirmBtn.innerHTML = '<div class="button-content"><div class="spinner"></div>Removing...</div>';

                // Remove device from floor
                floor.devices = floor.devices.filter(d => d.id !== deviceId);

                await this.saveFloors();
                this.renderDevicesList(floor.devices);
                this.renderFloorPlanDevices(floor);
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to remove device:', err);
                this.Homey.alert('Failed to remove device: ' + err.message);
            } finally {
                // Reset button states
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;
            }
        };

        // Event listeners
        if (confirmBtn) confirmBtn.onclick = handleDelete;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
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

                        // Compression through size reduction
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

                        // Determine if the image has transparency
                        let hasTransparency = false;
                        
                        // Check file type first
                        const fileType = file.type.toLowerCase();
                        if (fileType === 'image/png' || fileType === 'image/webp' || fileType === 'image/gif') {
                            // These formats support transparency, so we'll check for it
                            // Get image data to check for transparency
                            const imageData = ctx.getImageData(0, 0, width, height);
                            const data = imageData.data;
                            
                            // Check if any pixel has alpha < 255 (not fully opaque)
                            for (let i = 3; i < data.length; i += 4) {
                                if (data[i] < 255) {
                                    hasTransparency = true;
                                    break;
                                }
                            }
                        }
                        
                        // Use appropriate format based on transparency
                        let processedImageData;
                        if (hasTransparency) {
                            // Use PNG for images with transparency
                            processedImageData = canvas.toDataURL('image/png', 0.7);
                        } else {
                            // Use JPEG for images without transparency (better compression)
                            processedImageData = canvas.toDataURL('image/jpeg', 0.8);
                        }

                        const newFloor = {
                            id: Date.now().toString(),
                            name: nameInput.value.trim(),
                            imageData: processedImageData,
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
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            console.error('Delete confirmation dialog not found');
            return;
        }
        // Update dialog text for rule deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Delete Rule';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to delete this rule? This action cannot be undone.';

        // Get buttons
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        // Store original confirm button text
        const originalBtnText = confirmBtn.innerHTML;

        // Show dialog
        dialog.style.display = 'flex';

        const handleDelete = async () => {
            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (!floor) return;

            const device = floor.devices.find(d => d.id === deviceId);
            if (!device) return;

            try {
                // Show loading state
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                if (closeBtn) closeBtn.disabled = true;
                
                // Add spinner and loading text
                confirmBtn.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';

                // Remove rule from device
                device.rules = device.rules.filter(r => r.id !== ruleId);

                await this.saveFloors();
                // Update just the rules section
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    rulesSection.innerHTML = this.renderDeviceRules(device);
                    // Re-attach all event listeners
                    this.attachRuleEventListeners(rulesSection);
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to delete rule:', err);
                this.Homey.alert('Failed to delete rule: ' + err.message);
            } finally {
                // Reset button states
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;
            }
        };

        // Event listeners
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
                        this.attachRuleEventListeners(rulesSection);
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
    },

    addDeviceToFloor(device) {
        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) return;

        // Initialize devices array if it doesn't exist
        if (!floor.devices) {
            floor.devices = [];
        }

        // Get wrapper dimensions for positioning
        const wrapper = document.getElementById('imageWrapper');
        const wrapperRect = wrapper.getBoundingClientRect();

        // Calculate center position in percentages
        const position = {
            x: 50, // Center horizontally
            y: 50  // Center vertically
        };

        // Create new device object with position
        const newDevice = {
            id: device.id,
            name: device.name,
            iconObj: device.iconObj,
            capability: device.capability,
            position: position,
            rules: []
        };

        // Add default color rule if needed
        if (device.capability === 'onoff' || device.capability === 'dim') {
            newDevice.rules.push({
                id: generateUUID(),
                name: 'On/Off - Color Switcher',
                type: 'onOffColor',
                config: {
                    onColor: '#ffeb3b',  // Yellow
                    offColor: '#ffffff'   // White
                }
            });
        }

        // Add device to floor
        floor.devices.push(newDevice);

        try {
            // Render the new device
            const deviceEl = document.createElement('div');
            deviceEl.className = 'floor-plan-device';
            deviceEl.id = `device-${device.id}`;
            deviceEl.setAttribute('data-name', device.name);

            // Use the same positioning logic as settings-old.js
            const displayX = (position.x / 100) * wrapperRect.width;
            const displayY = (position.y / 100) * wrapperRect.height;

            deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
            
            deviceEl.innerHTML = `
                <img src="${device.iconObj?.url || 'default-icon.png'}" alt="${device.name}">
            `;

            // Add drag handlers
            deviceEl.addEventListener('touchstart', this.handleDragStart.bind(this), { passive: false });
            deviceEl.addEventListener('mousedown', this.handleDragStart.bind(this));

            // Add to container
            const container = document.getElementById('floorPlanDevices');
            container.appendChild(deviceEl);

            // Save floors
            this.saveFloors();
            
            // Update device list
            this.renderDevicesList(floor.devices);

            return newDevice;
        } catch (err) {
            console.error('Failed to add device:', err);
            this.Homey.alert('Failed to add device: ' + err.message);
        }
    },

    handleDragStart(e) {
        // Don't prevent default for touch events to allow scrolling
        if (!e.touches) {
            e.preventDefault();
        }
        
        const deviceEl = e.target.closest('.floor-plan-device');
        if (!deviceEl) return;

        // Store initial touch position to determine if this is a drag or scroll
        this.initialTouchPos = e.touches ? { 
            x: e.touches[0].clientX, 
            y: e.touches[0].clientY 
        } : null;
        
        this.dragStartTime = Date.now();
        this.isDragging = false;
        this.draggedDevice = deviceEl;
        
        // Get initial touch/mouse position
        const event = e.touches ? e.touches[0] : e;
        const wrapper = document.getElementById('imageWrapper');
        const wrapperRect = wrapper.getBoundingClientRect();
        const deviceRect = deviceEl.getBoundingClientRect();

        // Calculate offset from device center to click/touch point
        this.dragOffset = {
            x: event.clientX - (deviceRect.left + deviceRect.width / 2),
            y: event.clientY - (deviceRect.top + deviceRect.height / 2)
        };

        // Add move and end event listeners
        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', this.handleDragMove.bind(this));
            document.addEventListener('mouseup', this.handleDragEnd.bind(this));
        } else {
            document.addEventListener('touchmove', this.handleDragMove.bind(this), { passive: true });
            document.addEventListener('touchend', this.handleDragEnd.bind(this));
        }
    },

    handleDragMove(e) {
        if (!this.draggedDevice) return;
        
        const event = e.touches ? e.touches[0] : e;
        
        // For touch events, determine if this is a drag or scroll
        if (this.initialTouchPos && !this.isDragging) {
            const deltaX = Math.abs(event.clientX - this.initialTouchPos.x);
            const deltaY = Math.abs(event.clientY - this.initialTouchPos.y);
            const timeDelta = Date.now() - this.dragStartTime;
            
            // If movement is mostly vertical and quick, it's likely a scroll attempt
            if (deltaY > deltaX * 1.5 && timeDelta < 300) {
                this.handleDragEnd(e);
                return;
            }
            
            // If we've moved enough horizontally, consider it a drag
            if (deltaX > 10) {
                this.isDragging = true;
                // Now we can safely prevent default to avoid page scrolling during drag
                e.preventDefault();
            }
        } else if (!e.touches) {
            // For mouse events, always prevent default
            e.preventDefault();
        }
        
        // If we're not dragging yet, don't move the element
        if (this.initialTouchPos && !this.isDragging) {
            return;
        }

        const wrapper = document.getElementById('imageWrapper');
        const wrapperRect = wrapper.getBoundingClientRect();

        // Calculate new position relative to wrapper
        let x = event.clientX - wrapperRect.left - this.dragOffset.x;
        let y = event.clientY - wrapperRect.top - this.dragOffset.y;

        // Convert to percentages
        const posX = (x / wrapperRect.width) * 100;
        const posY = (y / wrapperRect.height) * 100;

        // Update device position
        const displayX = (posX / 100) * wrapperRect.width;
        const displayY = (posY / 100) * wrapperRect.height;
        
        this.draggedDevice.style.transform = `translate(${displayX}px, ${displayY}px)`;

        // Store current position for drag end
        this.currentDragPosition = { x: posX, y: posY };
    },

    handleDragEnd(e) {
        if (!this.draggedDevice) return;

        const deviceEl = this.draggedDevice;
        deviceEl.classList.remove('dragging');

        // Update device position in data only if we were actually dragging
        if (this.isDragging && this.currentDragPosition) {
            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (floor && floor.devices) {
                const deviceId = deviceEl.id.replace('device-', '');
                const device = floor.devices.find(d => d.id === deviceId);
                if (device) {
                    device.position = {
                        x: Math.max(0, Math.min(100, this.currentDragPosition.x)),
                        y: Math.max(0, Math.min(100, this.currentDragPosition.y))
                    };
                    this.saveFloors();
                }
            }
        }

        // Clean up
        this.draggedDevice = null;
        this.dragOffset = null;
        this.currentDragPosition = null;
        this.initialTouchPos = null;
        this.isDragging = false;

        // Remove event listeners
        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
        document.removeEventListener('touchmove', this.handleDragMove);
        document.removeEventListener('touchend', this.handleDragEnd);
    }
};

// Export for global access
window.floorManager = floorManager; 