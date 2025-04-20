const floorManager = {
    Homey: null,
    floors: [],
    currentFloorId: null,
    ruleManager: null,

    async initialize(Homey) {
        this.Homey = Homey;
        this.floors = [];
        this.currentFloorId = null;

        // Bind event handlers once to preserve references
        this.boundHandleDragMove = this.handleDragMove.bind(this);
        this.boundHandleDragEnd = this.handleDragEnd.bind(this);

        // Attach add floor button handler
        const addFloorButton = document.getElementById('addFloor');
        if (addFloorButton) {
            addFloorButton.onclick = () => this.showAddFloorDialog();
        }

        await this.loadFloors();

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
            window.log('No floors found to render');
            if (emptyState) emptyState.style.display = 'block';
            if (floorsList) floorsList.innerHTML = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (floorsList) {
            floorsList.innerHTML = this.floors.map(floor => {
                // Get image source with debug info
                const imageSource = this.getFloorImageSource(floor);

                return `
                    <div class="floor-card" data-floor-id="${floor.id}">
                        <div class="floor-thumbnail">
                            <img src="${imageSource}" alt="${floor.name}">
                        </div>
                        <div class="floor-info">
                            <h3>${floor.name}</h3>
                            <div class="floor-actions">
                                <button class="edit-floor" data-floor-id="${floor.id}">Edit</button>
                                <button class="delete-floor" data-floor-id="${floor.id}">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            this.attachFloorEventListeners();
        }
    },

    renderFloorCard(floor) {
        return `
            <div class="floor-card">
                <div class="floor-thumbnail">
                    <img src="${this.getFloorImageSource(floor)}" alt="${floor.name}">
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
        if (!floor) {
            return;
        }

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
        document.getElementById('floorMapImage').src = this.getFloorImageSource(floor);

        // Add image change button next to the back button in the header
        const viewHeader = document.querySelector('.view-header');
        if (viewHeader) {
            // Remove the button if it already exists
            let existingChangeBtn = document.getElementById('changeFloorImage');
            if (existingChangeBtn) {
                existingChangeBtn.remove();
            }

            // Create the change image button
            const changeImageBtn = document.createElement('button');
            changeImageBtn.id = 'changeFloorImage';
            changeImageBtn.className = 'icon-button header-action-button';
            changeImageBtn.title = 'Change Floor Image';
            changeImageBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
            `;
            changeImageBtn.onclick = () => this.showChangeImageDialog(floorId);

            // Insert after the back button
            const backButton = viewHeader.querySelector('#backToList');
            if (backButton && backButton.parentNode) {
                backButton.parentNode.insertBefore(changeImageBtn, backButton.nextSibling);
            } else {
                // If no back button, just add at the beginning
                viewHeader.insertBefore(changeImageBtn, viewHeader.firstChild);
            }
        }

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

        // Render floor rules
        this.renderFloorRules();

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
            window.logError('[UPDATE FLOOR NAME] Failed to update floor name:', err);
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
                window.logError('[SAVE FLOORS] Homey not initialized');
                throw new Error('Homey not initialized');
            }

            // Validate floors data before saving
            if (!this.floors) {
                window.logError('[SAVE FLOORS] Floors array is undefined');
                throw new Error('Invalid floors data');
            }

            // Make sure we're passing a valid array
            const floorsToSave = Array.isArray(this.floors) ? this.floors : [];


            // Ensure each floor has required properties and check image sizes
            const validFloors = floorsToSave.map(floor => {
                // Create a clean floor object with all required properties
                const newFloor = {
                    id: floor.id || Date.now().toString(),
                    name: floor.name || 'Unnamed Floor',
                    devices: Array.isArray(floor.devices) ? floor.devices : [],
                    imageAspectRatio: floor.imageAspectRatio || null,
                    rules: Array.isArray(floor.rules) ? floor.rules : []
                };

                // Include image ID and URLs
                if (floor.imageId) {
                    newFloor.imageId = floor.imageId;

                    // Include cloud and local URLs if they exist
                    if (floor.cloudUrl) newFloor.cloudUrl = floor.cloudUrl;
                    if (floor.localUrl) newFloor.localUrl = floor.localUrl;

                    // Only include imageData as a fallback if there's no imageUrl/imageId
                } else if (floor.imageData) {
                    newFloor.imageData = floor.imageData;

                    // Verify image data size
                    if (newFloor.imageData && !imageUtils.verifyImageSize(newFloor.imageData)) {
                        window.logError('[SAVE FLOORS] Floor image too large:', newFloor.id);
                        throw new Error(`The image for floor "${newFloor.name}" is too large and cannot be saved. Please try replacing it with a smaller image.`);
                    }
                }

                return newFloor;
            });

            // Update the floors array with validated data
            this.floors = validFloors;


            // Try to save to Homey
            try {
                await this.Homey.set('floors', validFloors);
                window.log('Floors saved successfully');
            } catch (error) {
                window.logError('[SAVE FLOORS] Error saving floors to Homey:', error);
                throw new Error('Failed to save floor data to Homey. The data may be too large or there may be a connection issue.');
            }
        } catch (err) {
            window.logError('[SAVE FLOORS] Error saving floors:', err);
            throw err;
        }
    },

    // Add Floor Dialog
    showAddFloorDialog() {
        const dialog = document.getElementById('floorDialog');
        if (!dialog) {
            window.logError('[SHOW ADD FLOOR DIALOG] Floor dialog not found');
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
                        if (saveButton) {
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

    saveNewFloor() {
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

            // Check file size before processing
            if (file.size > 15 * 1024 * 1024) { // 15MB
                this.Homey.alert(`The image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please choose an image smaller than 15MB.`);
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.innerHTML = 'Create Floor';
                return;
            }

            // Process and save using Homey Images API
            this.processAndSaveFloorWithHomeyImages(file, nameInput.value.trim(), saveButton, cancelButton, dialog);
        } catch (err) {
            window.logError('[SAVE NEW FLOOR] Failed to save floor:', err);
            this.Homey.alert('Failed to save floor: ' + err.message);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        }
    },

    // Helper method to process image and save floor using Homey Images API
    async processAndSaveFloorWithHomeyImages(file, floorName, saveButton, cancelButton, dialog) {
        try {
            // Disable buttons and show loading state
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Saving...</div>';

            // Read the file as a data URL
            const imageData = await this.readFileAsDataURL(file);

            try {
                // Upload the image using the API endpoint

                try {
                    const response = await this.Homey.api('POST', '/floor-images/upload', {
                        imageData: imageData
                    });


                    if (!response || !response.success) {
                        throw new Error(response?.error || 'Failed to upload image');
                    }

                    // Determine URL based on environment
                    const hostname = window.location.hostname;
                    const isLocalEnvironment = hostname.includes('192.168.') ||
                        hostname.includes('localhost') ||
                        hostname.includes('.local');
                    const imageUrl = isLocalEnvironment ? response.localUrl : response.cloudUrl;

                    // Use the aspectRatio method to get dimensions
                    const aspectRatio = await this.getImageAspectRatio(imageUrl);

                    // Create new floor object with Homey Image API data
                    const newFloor = {
                        id: Date.now().toString(),
                        name: floorName,
                        imageId: response.imageId,
                        // Store both cloud and local URLs from the API response
                        cloudUrl: response.cloudUrl,
                        localUrl: response.localUrl,
                        devices: [],
                        imageAspectRatio: aspectRatio,
                        rules: [
                            {
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
                            },
                            {
                                id: generateUUID(),
                                name: 'Alarm - Color Switcher',
                                type: 'alarmColor',
                                config: {
                                    // On state settings (Alarm Yes)
                                    showIconOn: true,
                                    iconColorOn: '#ff0000',
                                    showCloudOn: true,
                                    cloudColorOn: '#ff0000',

                                    // Off state settings (Alarm No)
                                    showIconOff: true,
                                    iconColorOff: '#ffffff',
                                    showCloudOff: true,
                                    cloudColorOff: '#ffffff'
                                }
                            }
                        ]
                    };

                    // Add to floors array
                    this.floors.push(newFloor);

                    // Save to Homey settings
                    await this.saveFloors();

                    // Update UI
                    this.renderFloorsList();
                    dialog.style.display = 'none';
                    this.resetFloorDialog();
                } catch (apiError) {
                    console.error('API call error:', apiError);
                    window.logError('[API CALL ERROR]', apiError);
                    throw new Error(`API call failed: ${apiError.message}`);
                }
            } catch (err) {
                window.logError('[PROCESS AND SAVE WITH HOMEY IMAGES] API failed:', err);
                throw new Error('Failed to process image: ' + err.message);
            }

            // Reset button states
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        } catch (err) {
            window.logError('[PROCESS AND SAVE WITH HOMEY IMAGES] Failed:', err);
            this.Homey.alert('Failed to save floor: ' + err.message);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        }
    },

    // Keep both helper methods
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            reader.onerror = (err) => {
                reject(err);
            };
            reader.readAsArrayBuffer(file);
        });
    },

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            reader.onerror = (err) => {
                reject(err);
            };
            reader.readAsDataURL(file);
        });
    },

    // Helper method to get image aspect ratio
    getImageAspectRatio(imageData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve(img.naturalWidth / img.naturalHeight);
            };
            img.onerror = () => {
                // Default to 1.5 aspect ratio if we can't determine
                resolve(1.5);
            };
            img.src = imageData;
        });
    },

    // Delete Floor
    showDeleteFloorDialog(floorId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            window.logError('[SHOW DELETE FLOOR DIALOG] Delete confirmation dialog not found');
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
                window.logError('[SHOW DELETE FLOOR DIALOG] Failed to delete floor:', err);
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

            // Get icon source - use base64 if available
            let iconSrc = 'default-icon.png';
            if (device.iconObj?.base64) {
                iconSrc = device.iconObj.base64;
            } else if (device.iconObj?.url) {
                iconSrc = device.iconObj.url;
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
                            <div class="device-icon-small">
                                <img src="${iconSrc}" alt="${device.name}">
                            </div>
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
        element.querySelectorAll('.delete-rule-btn').forEach(button => {
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

        if (!container || !image || !wrapper) {
            window.logError('[RENDER DEVICES] Missing required elements:');
            return;
        }

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
            overflow: hidden;
        `;

        // Wait for image to load
        if (!image.complete) {
            image.onload = () => this.renderFloorPlanDevices(floor);
            return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();

        // Store the image aspect ratio for future use
        const imageAspectRatio = image.naturalWidth / image.naturalHeight;
        floor.imageAspectRatio = imageAspectRatio;

        // Get the actual displayed dimensions of the image
        const imageRect = image.getBoundingClientRect();


        floor.devices.forEach(device => {

            const deviceEl = document.createElement('div');
            deviceEl.className = 'floor-plan-device';
            deviceEl.id = `device-${device.id}`;
            deviceEl.setAttribute('data-name', device.name);

            // Calculate the actual position based on the percentage and the displayed image dimensions
            let displayX, displayY;

            // If the image is constrained by height (taller than wide relative to container)
            if (imageRect.width < wrapperRect.width) {
                // Image is centered horizontally, so adjust X coordinate
                const horizontalOffset = (wrapperRect.width - imageRect.width) / 2;
                displayX = horizontalOffset + (device.position.x / 100) * imageRect.width;
                displayY = (device.position.y / 100) * imageRect.height;
            }
            // If the image is constrained by width (wider than tall relative to container)
            else if (imageRect.height < wrapperRect.height) {
                // Image is centered vertically, so adjust Y coordinate
                const verticalOffset = (wrapperRect.height - imageRect.height) / 2;
                displayX = (device.position.x / 100) * imageRect.width;
                displayY = verticalOffset + (device.position.y / 100) * imageRect.height;
            }
            // If the image fills the container (rare case)
            else {
                displayX = (device.position.x / 100) * imageRect.width;
                displayY = (device.position.y / 100) * imageRect.height;
            }

            // Use transform instead of left/top for more precise positioning
            deviceEl.style.left = '0';
            deviceEl.style.top = '0';
            deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;

            // Use base64 data if available, otherwise fall back to URL
            let iconSrc = 'default-icon.png';
            if (device.iconObj?.base64) {
                iconSrc = device.iconObj.base64;
            } else if (device.iconObj?.url) {
                iconSrc = device.iconObj.url;
            }

            deviceEl.innerHTML = `
                <img src="${iconSrc}" alt="${device.name}">
            `;

            // Add drag handlers
            deviceEl.addEventListener('touchstart', this.handleDragStart.bind(this), { passive: false });
            deviceEl.addEventListener('mousedown', this.handleDragStart.bind(this));

            container.appendChild(deviceEl);
        });
    },

    removeDevice(deviceId) {
        const dialog = document.getElementById('deleteConfirmDialog');

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
                window.logError('[REMOVE DEVICE] Failed to remove device:', err);
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

            // Process and save using Homey Images API
            this.processAndSaveFloorWithHomeyImages(file, nameInput.value.trim(), saveButton, cancelButton, dialog);
        } catch (err) {
            window.logError('[HANDLE SAVE FLOOR] Failed to read image:', err);
            this.Homey.alert('Failed to read image: ' + err.message);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Create Floor';
        }
    },

    deleteRule(deviceId, ruleId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            window.logError('[DELETE RULE] Delete confirmation dialog not found');
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
                window.logError('[DELETE RULE] Failed to delete rule:', err);
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
                window.logError('[EDIT RULE] Failed to save rule:', err);
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

            // Use base64 data if available, otherwise fall back to URL
            let iconSrc = 'default-icon.png';
            if (device.iconObj?.base64) {
                iconSrc = device.iconObj.base64;
            } else if (device.iconObj?.url) {
                iconSrc = device.iconObj.url;
            }

            deviceEl.innerHTML = `
                <img src="${iconSrc}" alt="${device.name}">
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
            window.logError('[ADD DEVICE TO FLOOR] Failed to add device:', err);
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

        // Get the current floor based on currentFloorId
        const currentFloor = this.floors.find(f => f.id === this.currentFloorId);

        // Get the floor map image and store its dimensions
        const floorMapImage = document.getElementById('floorMapImage');
        if (floorMapImage && currentFloor) {
            // Store the image aspect ratio if not already stored
            if (!currentFloor.imageAspectRatio) {
                currentFloor.imageAspectRatio = floorMapImage.naturalWidth / floorMapImage.naturalHeight;
            }
        }

        this.draggedDevice = deviceEl;
        deviceEl.classList.add('dragging');

        const event = e.touches ? e.touches[0] : e;
        const rect = deviceEl.getBoundingClientRect();

        // Calculate offset from the top-left corner of the element
        this.dragOffset = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        // For touch events, store initial position to determine if it's a drag or scroll
        this.initialTouchPos = {
            x: event.clientX,
            y: event.clientY
        };

        this.dragStartTime = Date.now();
        this.isDragging = false;

        // Add document-level event listeners
        if (!e.touches) {
            document.addEventListener('mousemove', this.boundHandleDragMove);
            document.addEventListener('mouseup', this.boundHandleDragEnd);
        } else {
            document.addEventListener('touchmove', this.boundHandleDragMove, { passive: true });
            document.addEventListener('touchend', this.boundHandleDragEnd);
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

        // Get the floor map image
        const floorMapImage = document.getElementById('floorMapImage');

        // Get the current floor data which includes the aspect ratio
        const currentFloor = this.floors.find(f => f.id === this.currentFloorId);
        const imageAspectRatio = currentFloor?.imageAspectRatio || (floorMapImage.naturalWidth / floorMapImage.naturalHeight);

        // Get the actual displayed dimensions of the image
        const imageRect = floorMapImage.getBoundingClientRect();

        // Calculate new position relative to wrapper
        let x = event.clientX - wrapperRect.left - this.dragOffset.x;
        let y = event.clientY - wrapperRect.top - this.dragOffset.y;

        // Calculate position relative to the actual image, not the wrapper
        let posX, posY;

        // If the image is constrained by height (taller than wide relative to container)
        if (imageRect.width < wrapperRect.width) {
            // Adjust for horizontal centering
            const horizontalOffset = (wrapperRect.width - imageRect.width) / 2;
            x = x - horizontalOffset;
            // Ensure x is within the image bounds
            x = Math.max(0, Math.min(x, imageRect.width));
            // Calculate percentage based on image dimensions
            posX = (x / imageRect.width) * 100;
            posY = (y / imageRect.height) * 100;
        }
        // If the image is constrained by width (wider than tall relative to container)
        else if (imageRect.height < wrapperRect.height) {
            // Adjust for vertical centering
            const verticalOffset = (wrapperRect.height - imageRect.height) / 2;
            y = y - verticalOffset;
            // Ensure y is within the image bounds
            y = Math.max(0, Math.min(y, imageRect.height));
            // Calculate percentage based on image dimensions
            posX = (x / imageRect.width) * 100;
            posY = (y / imageRect.height) * 100;
        }
        // If the image fills the container (rare case)
        else {
            // Calculate percentage based on image dimensions
            posX = (x / imageRect.width) * 100;
            posY = (y / imageRect.height) * 100;
        }

        // Ensure percentages are within bounds
        posX = Math.max(0, Math.min(posX, 100));
        posY = Math.max(0, Math.min(posY, 100));

        // Calculate display position for visual feedback
        let displayX, displayY;

        // If the image is constrained by height (taller than wide relative to container)
        if (imageRect.width < wrapperRect.width) {
            // Image is centered horizontally, so adjust X coordinate
            const horizontalOffset = (wrapperRect.width - imageRect.width) / 2;
            displayX = horizontalOffset + (posX / 100) * imageRect.width;
            displayY = (posY / 100) * imageRect.height;
        }
        // If the image is constrained by width (wider than tall relative to container)
        else if (imageRect.height < wrapperRect.height) {
            // Image is centered vertically, so adjust Y coordinate
            const verticalOffset = (wrapperRect.height - imageRect.height) / 2;
            displayX = (posX / 100) * imageRect.width;
            displayY = verticalOffset + (posY / 100) * imageRect.height;
        }
        // If the image fills the container (rare case)
        else {
            displayX = (posX / 100) * imageRect.width;
            displayY = (posY / 100) * imageRect.height;
        }

        this.draggedDevice.style.transform = `translate(${displayX}px, ${displayY}px)`;

        // Store current position for drag end
        this.currentDragPosition = { x: posX, y: posY };
    },

    handleDragEnd(e) {

        if (!this.draggedDevice) {
            return;
        }

        const deviceEl = this.draggedDevice;
        deviceEl.classList.remove('dragging');

        // Always update device position if we have a valid position
        if (this.currentDragPosition) {

            const floor = this.floors.find(f => f.id === this.currentFloorId);
            if (floor && floor.devices) {

                // Ensure the floor has the image aspect ratio stored
                if (!floor.imageAspectRatio) {
                    const floorMapImage = document.getElementById('floorMapImage');
                    if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                        floor.imageAspectRatio = floorMapImage.naturalWidth / floorMapImage.naturalHeight;
                    }
                }

                const deviceId = deviceEl.id.replace('device-', '');
                const device = floor.devices.find(d => d.id === deviceId);
                if (device) {

                    device.position = {
                        x: Math.max(0, Math.min(100, this.currentDragPosition.x)),
                        y: Math.max(0, Math.min(100, this.currentDragPosition.y))
                    };

                    this.saveFloors()
                        .catch(err => {
                            window.logError('[DRAG END] Failed to save device position:', err);
                            this.Homey.alert('Failed to save device position: ' + err.message);
                        });
                }
            }
        }

        // Clean up
        this.draggedDevice = null;
        this.dragOffset = null;
        this.currentDragPosition = null;
        this.initialTouchPos = null;
        this.isDragging = false;

        // Remove event listeners using the bound handlers
        document.removeEventListener('mousemove', this.boundHandleDragMove);
        document.removeEventListener('mouseup', this.boundHandleDragEnd);
        document.removeEventListener('touchmove', this.boundHandleDragMove);
        document.removeEventListener('touchend', this.boundHandleDragEnd);
    },

    // New method to show change image dialog
    showChangeImageDialog(floorId) {
        const floor = this.floors.find(f => f.id === floorId);
        if (!floor) return;

        const dialog = document.getElementById('floorDialog');
        if (!dialog) {
            window.logError('[SHOW CHANGE IMAGE DIALOG] Floor dialog not found');
            return;
        }

        // Update dialog title and button text
        const dialogTitle = dialog.querySelector('.modal-title');
        if (dialogTitle) dialogTitle.textContent = 'Change Floor Image';

        // Reset form
        const nameInput = dialog.querySelector('#floorName');
        const imageInput = dialog.querySelector('#floorImage');
        const saveButton = dialog.querySelector('#saveFloor');
        const previewImage = dialog.querySelector('#imagePreview');
        const closeButton = dialog.querySelector('.modal-close-button');
        const cancelButton = dialog.querySelector('#cancelFloor');

        // Set current floor name but hide this field since we're only changing the image
        if (nameInput) {
            nameInput.value = floor.name;
            nameInput.parentElement.style.display = 'none'; // Hide the name field
        }

        if (imageInput) imageInput.value = '';
        if (previewImage) previewImage.innerHTML = '';

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Update Image';
            saveButton.onclick = () => this.saveChangedImage(floorId);
        }

        // Setup image preview
        if (imageInput) {
            imageInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file && previewImage) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewImage.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; height: auto;">`;
                        if (saveButton) {
                            saveButton.disabled = false;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        // Setup close handlers
        if (closeButton) {
            closeButton.onclick = () => {
                dialog.style.display = 'none';
                // Restore name field visibility when closing
                if (nameInput?.parentElement) nameInput.parentElement.style.display = '';
            };
        }
        if (cancelButton) {
            cancelButton.onclick = () => {
                dialog.style.display = 'none';
                // Restore name field visibility when closing
                if (nameInput?.parentElement) nameInput.parentElement.style.display = '';
            };
        }

        // Show dialog
        dialog.style.display = 'flex';
    },

    // New method to save changed image
    async saveChangedImage(floorId) {
        const dialog = document.getElementById('floorDialog');
        const imageInput = dialog.querySelector('#floorImage');
        const saveButton = dialog.querySelector('#saveFloor');
        const cancelButton = dialog.querySelector('#cancelFloor');
        const nameInput = dialog.querySelector('#floorName');

        if (!imageInput?.files[0]) {
            this.Homey.alert('Please select a new image');
            return;
        }

        try {
            // Disable buttons and show loading state
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.innerHTML = '<div class="button-content"><div class="spinner"></div>Updating...</div>';

            // Read the image file
            const file = imageInput.files[0];

            // Check file size before processing
            if (file.size > 15 * 1024 * 1024) { // 15MB
                this.Homey.alert(`The image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please choose an image smaller than 15MB.`);
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.innerHTML = 'Update Image';

                // Restore name field visibility
                if (nameInput?.parentElement) nameInput.parentElement.style.display = '';
                return;
            }

            // Get the floor object to update
            const floor = this.floors.find(f => f.id === floorId);
            if (!floor) {
                throw new Error('Floor not found');
            }

            try {
                // Read the file as a data URL
                const imageData = await this.readFileAsDataURL(file);

                // Always create new image instead of updating
                const response = await this.Homey.api('POST', '/floor-images/upload', {
                    imageData: imageData
                });

                if (!response || !response.success) {
                    window.logError('API response error:', response?.error);
                    throw new Error(response?.error || 'Failed to process image');
                }

                // Remove old image references (no need to keep them)
                // Homey will automatically clean up unused images eventually

                // Determine URL based on environment
                const hostname = window.location.hostname;
                const isLocalEnvironment = hostname.includes('192.168.') ||
                    hostname.includes('localhost') ||
                    hostname.includes('.local');
                const imageUrl = isLocalEnvironment ? response.localUrl : response.cloudUrl;

                // Get dimensions for aspect ratio
                const aspectRatio = await this.getImageAspectRatio(imageUrl);

                // Update floor with new image properties
                floor.imageId = response.imageId;
                // Store both cloud and local URLs from the API response
                floor.cloudUrl = response.cloudUrl;
                floor.localUrl = response.localUrl;
                // Remove any legacy imageUrl
                if (floor.imageUrl) delete floor.imageUrl;
                floor.imageAspectRatio = aspectRatio;

                // Remove any base64 data if it exists (we're fully transitioning to Homey Images API)
                if (floor.imageData) {
                    delete floor.imageData;
                }

                // Save to Homey settings
                await this.saveFloors();

                // Update the image in the UI
                const floorMapImage = document.getElementById('floorMapImage');
                if (floorMapImage) {
                    floorMapImage.src = this.getFloorImageSource(floor);
                }

                // Re-render floor plan devices with the new image
                this.renderFloorPlanDevices(floor);

                // Close dialog
                dialog.style.display = 'none';
            } catch (apiError) {
                console.error('API call error:', apiError);
                window.logError('[API CALL ERROR]', apiError);
                throw new Error('Failed to process image: ' + apiError.message);
            }
        } catch (err) {
            window.logError('[SAVE CHANGED IMAGE] Failed:', err);
            this.Homey.alert(err.message || 'Failed to update image. The image may be too large or in an unsupported format.');
        } finally {
            // Reset button states
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.innerHTML = 'Update Image';

            // Restore name field visibility
            if (nameInput?.parentElement) nameInput.parentElement.style.display = '';
        }
    },

    dragResizeRender() {
        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) {
            window.logError('[DRAG RESIZE] Floor not found:', this.currentFloorId);
            return;
        }

        const floorContainer = document.getElementById('deviceDragContainer');
        floorContainer.innerHTML = '';

        // Create the floor image
        const floorImage = document.createElement('img');
        floorImage.id = 'dragFloorImage';
        floorImage.src = this.getFloorImageSource(floor);
        floorImage.style.width = '100%';
        floorImage.style.height = 'auto';
        floorImage.style.position = 'absolute';
        floorImage.style.top = '0';
        floorImage.style.left = '0';
        floorImage.style.zIndex = '1';

        floorContainer.appendChild(floorImage);
    },

    // Function to get the best image source for a floor
    getFloorImageSource(floor) {
        // If there's no floor data, return a default image
        if (!floor) {
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZmlsbD0iIzk5OTk5OSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
        }

        // Choose URL based on environment
        if (floor.imageId) {
            return floor.cloudUrl;
        }

        // Fall back to direct image data if available
        if (floor.imageData) {
            return floor.imageData;
        }

        // Default image if nothing else is available
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZmlsbD0iIzk5OTk5OSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
    },

    // Render the floor rules list
    renderFloorRules() {
        const floorRulesList = document.getElementById('floorRulesList');
        if (!floorRulesList) return;

        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) return;

        if (!floor.rules || floor.rules.length === 0) {
            floorRulesList.innerHTML = `
                <div class="empty-rules-state">
                    <p>No floor rules added yet</p>
                    <p>Floor rules apply to the entire floor plan and all devices on it</p>
                </div>`;
            return;
        }

        floorRulesList.innerHTML = floor.rules.map(rule => `
            <div class="floor-rule-item">
                <div class="rule-info">
                    <span class="rule-name">${rule.name}</span>
                    <span class="rule-type">${rule.type}</span>
                </div>
                <div class="rule-actions">
                    <button class="icon-button edit-floor-rule" data-rule-id="${rule.id}" title="Edit">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#666" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-floor-rule-btn" data-rule-id="${rule.id}" title="Delete">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#ff4444" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        this.attachFloorRuleEventListeners();
    },

    // Attach event listeners to floor rule elements
    attachFloorRuleEventListeners() {
        const floorRulesList = document.getElementById('floorRulesList');
        if (!floorRulesList) return;

        // Edit rule buttons
        floorRulesList.querySelectorAll('.edit-floor-rule').forEach(button => {
            button.addEventListener('click', () => {
                const ruleId = button.dataset.ruleId;
                this.editFloorRule(ruleId);
            });
        });

        // Delete rule buttons
        floorRulesList.querySelectorAll('.delete-floor-rule-btn').forEach(button => {
            button.addEventListener('click', () => {
                const ruleId = button.dataset.ruleId;
                this.deleteFloorRule(ruleId);
            });
        });

        // Add rule button
        const addFloorRuleBtn = document.getElementById('addFloorRule');
        if (addFloorRuleBtn) {
            // Remove existing event listeners
            const newAddBtn = addFloorRuleBtn.cloneNode(true);
            addFloorRuleBtn.parentNode.replaceChild(newAddBtn, addFloorRuleBtn);

            // Add new event listener
            newAddBtn.addEventListener('click', () => {
                this.addFloorRule();
            });
        }
    },

    // Add a new floor rule
    addFloorRule() {
        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) return;

        // Create a new rule with default values
        const newRule = {
            id: generateUUID(),
            name: 'New Floor Rule',
            type: 'floorRule',
            config: {
                // Default configuration
                showInteractionZones: true,
                zoneColor: '#1976D2',
                showDeviceLabels: true
            }
        };

        // Add rule to floor
        if (!floor.rules) {
            floor.rules = [];
        }
        floor.rules.push(newRule);

        // Save floors
        this.saveFloors()
            .then(() => {
                // Update UI
                this.renderFloorRules();
            })
            .catch(err => {
                window.logError('[ADD FLOOR RULE] Failed to add rule:', err);
                this.Homey.alert('Failed to add floor rule: ' + err.message);
            });
    },

    // Edit a floor rule
    editFloorRule(ruleId) {
        const floor = this.floors.find(f => f.id === this.currentFloorId);
        if (!floor) return;

        const rule = floor.rules.find(r => r.id === ruleId);
        if (!rule) return;

        // For now, we'll implement a simple toggle for the rule configuration
        if (rule.config.showInteractionZones) {
            rule.config.showInteractionZones = false;
        } else {
            rule.config.showInteractionZones = true;
        }

        // Save changes
        this.saveFloors()
            .then(() => {
                // Update UI
                this.renderFloorRules();
            })
            .catch(err => {
                window.logError('[EDIT FLOOR RULE] Failed to edit rule:', err);
                this.Homey.alert('Failed to edit floor rule: ' + err.message);
            });
    },

    // Delete a floor rule
    deleteFloorRule(ruleId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) return;

        // Update dialog text for rule deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Delete Floor Rule';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to delete this floor rule? This action cannot be undone.';

        // Show dialog
        dialog.style.display = 'flex';

        // Get buttons
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');

        // Store original confirm button text
        const originalBtnText = confirmBtn.innerHTML;

        // Store current handlers
        const oldConfirmHandler = confirmBtn.onclick;
        const oldCancelHandler = cancelBtn.onclick;
        const oldCloseHandler = closeBtn.onclick;

        const handleDelete = async () => {
            try {
                const floor = this.floors.find(f => f.id === this.currentFloorId);
                if (!floor) return;

                // Show loading state
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                if (closeBtn) closeBtn.disabled = true;

                // Add spinner and loading text
                confirmBtn.innerHTML = '<div class="button-content"><div class="spinner"></div>Deleting...</div>';

                // Remove rule
                floor.rules = floor.rules.filter(r => r.id !== ruleId);

                // Save changes
                await this.saveFloors();

                // Update UI
                this.renderFloorRules();

                // Close dialog
                dialog.style.display = 'none';
            } catch (err) {
                window.logError('[DELETE FLOOR RULE] Failed to delete rule:', err);
                this.Homey.alert('Failed to delete floor rule: ' + err.message);
            } finally {
                // Reset button states
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;

                // Restore original handlers
                confirmBtn.onclick = oldConfirmHandler;
                cancelBtn.onclick = oldCancelHandler;
                closeBtn.onclick = oldCloseHandler;
            }
        };

        // Set event listeners
        confirmBtn.onclick = handleDelete;
        cancelBtn.onclick = () => {
            dialog.style.display = 'none';
            // Restore original handlers
            confirmBtn.onclick = oldConfirmHandler;
            cancelBtn.onclick = oldCancelHandler;
            closeBtn.onclick = oldCloseHandler;
        };
        closeBtn.onclick = () => {
            dialog.style.display = 'none';
            // Restore original handlers
            confirmBtn.onclick = oldConfirmHandler;
            cancelBtn.onclick = oldCancelHandler;
            closeBtn.onclick = oldCloseHandler;
        };
    },

    init() {
        this.setupEventListeners();
        this.loadFloors();
        this.initImageDropZone();
        this.attachFloorRuleEventListeners();

    },

};

// Export for global access
window.floorManager = floorManager; 