const ruleManager = {
    Homey: null,
    floorManager: null,
    currentDeviceId: null,
    currentRuleId: null,
    iconData: null, // Store icon data
    isEditing: false,

    RULE_TYPES: {
        allIcon: { name: 'All - Icon Select', allowMultiple: false },
        allColor: { name: 'All - Color Select', allowMultiple: false },
        onOffColor: { name: 'On/Off - Color Switcher', allowMultiple: false },
        onOffImage: { name: 'On/Off - Image Switcher', allowMultiple: false },
        measureDisplay: { name: 'Measure - Display Settings', allowMultiple: false },
        alarmColor: { name: 'Alarm - Color Switcher', allowMultiple: false }
    },

    init(floorManager, Homey) {
        this.floorManager = floorManager;
        this.Homey = Homey;
        this.attachImageUploadHandlers();
        this.initialize();
        this.initializeFormListeners();
    },

    attachImageUploadHandlers() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'ruleImage') {
                this.handleRuleImageUpload(e);
            }
        });
    },

    handleRuleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    // Create canvas for resizing
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Use smaller dimensions for rule images
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

                    // Update preview
                    const preview = document.getElementById('ruleImagePreview');
                    preview.innerHTML = `
                        <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                            <img src="${processedImageData}" style="width: 100%; height: auto; object-fit: contain;">
                        </div>`;

                    // Enable save button since we have an image
                    const saveButton = document.getElementById('saveRule');
                    if (saveButton) {
                        saveButton.disabled = false;
                    }

                } catch (err) {
                    window.logError('[HANDLE RULE IMAGE UPLOAD] Failed to process image:', err);
                    this.Homey.alert('Failed to process image: ' + err.message);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    getRuleName(type) {
        return this.RULE_TYPES[type]?.name || 'New Rule';
    },

    renderRuleConfig(ruleType, deviceOrRule) {
        // Determine if we're dealing with a device or a rule
        let rule = null;
        let device = null;
        
        if (deviceOrRule && deviceOrRule.rules) {
            // We were passed a device
            device = deviceOrRule;
        } else if (deviceOrRule && deviceOrRule.id) {
            // We were passed a rule
            rule = deviceOrRule;
        }
        
        if (!rule && device && this.currentRuleId) {
            // Find the rule by ID from the device
            rule = device.rules.find(r => r.id === this.currentRuleId);
        }
        
        // Get the appropriate config HTML based on rule type
        return this.getRuleConfigHTML(ruleType, rule);
    },

    async handleImageUpload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    renderRules(device) {
        if (!device.rules || device.rules.length === 0) {
            return `
                <div class="add-rule-row" data-device-id="${device.id}">
                    <span>Add new rule</span>
                    <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#666" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                </div>`;
        }

        return `
            ${device.rules.map(rule => this.renderRuleItem(device.id, rule)).join('')}
            <div class="add-rule-row" data-device-id="${device.id}">
                <span>Add new rule</span>
                <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#666" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
            </div>`;
    },

    renderRuleItem(deviceId, rule) {
        return `
            <div class="rule-item">
                <div class="rule-info">
                    <span class="rule-name">${rule.name}</span>
                </div>
                <div class="rule-actions">
                    <button class="icon-button edit-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}" title="Edit">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#666" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-rule-btn" data-device-id="${deviceId}" data-rule-id="${rule.id}" title="Delete">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#ff4444" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    },

    getRuleActionDescription(rule) {
        const actions = {
            turnOn: 'Turn On',
            turnOff: 'Turn Off'
        };
        let desc = actions[rule.config.action] || rule.config.action;

        if (rule.type === 'onLeave' && rule.config.delay) {
            desc += ` after ${rule.config.delay}s`;
        } else if (rule.type === 'onStay' && rule.config.interval) {
            desc += ` every ${rule.config.interval}s`;
        }

        return desc;
    },

    addRule(deviceId) {
        const dialog = document.getElementById('ruleDialog');

        // Reset edit state
        this.isEditing = false;
        this.currentRuleId = null;
        this.currentDeviceId = deviceId;

        // Reset and prepare dialog for new rule
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');
        const closeButton = dialog.querySelector('.modal-close-button');
        const cancelButton = dialog.querySelector('#cancelRule');

        // Clear previous content
        configSection.innerHTML = '';
        typeSelect.value = '';
        typeSelect.disabled = false;

        if (titleElement) titleElement.textContent = 'Add New Rule';
        if (saveButton) {
            saveButton.textContent = 'Add Rule';
            saveButton.disabled = true;
            saveButton.onclick = () => this.saveRule(typeSelect.value);
        }

        // Setup close handlers
        if (closeButton) {
            closeButton.onclick = () => {
                this.cleanupEventListeners();
                dialog.style.display = 'none';
            };
        }
        if (cancelButton) {
            cancelButton.onclick = () => {
                this.cleanupEventListeners();
                dialog.style.display = 'none';
            };
        }

        // Get existing rule types for this device
        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) return;

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) return;

        // Filter available rule types based on device capabilities and existing rules
        const existingRuleTypes = device.rules.map(r => r.type);
        
        // Determine valid rule types based on device capability
        let validRuleTypes = [];
        
        // Universal rules that can be used with any device type
        validRuleTypes.push('allIcon', 'allColor');
        
        // Rules specific to onoff/dim capabilities
        if (device.capability === 'onoff' || device.capability === 'dim') {
            validRuleTypes.push('onOffColor', 'onOffImage');
        }
        
        // Rules specific to measure capabilities
        if (device.capability === 'measure') {
            validRuleTypes.push('measureDisplay');
        }
        
        // Rules specific to alarm/sensor capabilities
        if (device.capability === 'sensor' || 
            (device.sensorType && 
             (device.sensorType === 'alarm_motion' || device.sensorType === 'alarm_contact'))) {
            validRuleTypes.push('alarmColor');
        }
        
        // Filter available rule types based on existing rules and valid types
        const availableTypes = Object.entries(this.RULE_TYPES)
            .filter(([type, config]) =>
                validRuleTypes.includes(type) && 
                (config.allowMultiple || !existingRuleTypes.includes(type))
            );

        // Populate rule type dropdown
        typeSelect.innerHTML = `
            <option value="">Choose a rule type...</option>
            ${availableTypes.map(([type, config]) =>
            `<option value="${type}">${config.name}</option>`
        ).join('')}
        `;

        // Add change listener for rule type
        typeSelect.onchange = () => {
            const ruleType = typeSelect.value;
            
            if (!ruleType) {
                configSection.innerHTML = '';
                saveButton.disabled = true;
                return;
            }

            configSection.innerHTML = this.renderRuleConfig(ruleType, device);

            // Attach event listeners for color-related rule types
            if (ruleType === 'allIcon' || ruleType === 'allColor' || ruleType === 'onOffColor' || ruleType === 'alarmColor') {
                this.attachRuleEventListeners();
            }

            saveButton.disabled = ruleType === 'allIcon';
        };

        dialog.style.display = 'flex';
    },

    editRule(deviceId, ruleId) {
        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) {
            this.Homey.alert('Floor not found!');
            return;
        }

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) {
            this.Homey.alert('Device not found!');
            return;
        }

        const rule = device.rules.find(r => r.id === ruleId);
        if (!rule) {
            this.Homey.alert('Rule not found!');
            return;
        }

        // Set current state
        this.isEditing = true;
        this.currentDeviceId = deviceId;
        this.currentRuleId = ruleId;

        // Get dialog elements
        const dialog = document.getElementById('ruleDialog');
        const titleEl = dialog.querySelector('#ruleDialogTitle');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');

        // Update dialog for editing
        if (titleEl) titleEl.textContent = `Edit Rule: ${rule.name}`;
        if (typeSelect) {
            typeSelect.value = rule.type;
            typeSelect.disabled = true;  // Don't allow changing type when editing
        }

        // Render the appropriate config for this rule type
        if (configSection) {
            configSection.innerHTML = this.renderRuleConfig(rule.type, rule);
            this.attachRuleEventListeners();
        }

        // Show the dialog
        dialog.style.display = 'flex';
    },

    onRuleTypeChange(type, existingRule = null) {
        const configSection = document.getElementById('ruleConfig');
        if (!configSection) return;

        configSection.innerHTML = this.getRuleConfigHTML(type, existingRule);
        
        // Special handling for temperature and humidity controls if this is a measureDisplay rule
        if (type === 'measureDisplay') {
            setTimeout(() => {
                const showTemperature = document.getElementById('showTemperature');
                const temperatureColor = document.getElementById('temperatureColor');
                const showHumidity = document.getElementById('showHumidity');
                const humidityColor = document.getElementById('humidityColor');

                if (showTemperature && temperatureColor) {
                    showTemperature.addEventListener('change', (e) => {
                        temperatureColor.disabled = !e.target.checked;
                    });
                }
                
                if (showHumidity && humidityColor) {
                    showHumidity.addEventListener('change', (e) => {
                        humidityColor.disabled = !e.target.checked;
                    });
                }
            }, 100);
        }
    },

    getRuleConfigHTML(type, rule = null) {
        switch (type) {
            case 'onEnter':
                return this.getEnterConfigHTML(rule);
            case 'onLeave':
                return this.getLeaveConfigHTML(rule);
            case 'onStay':
                return this.getStayConfigHTML(rule);
            default:
                return '<p>Unknown rule type</p>';
        }
    },

    getEnterConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action when entering zone</label>
                <select class="homey-form-input" id="enterAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
            </div>`;
    },

    getLeaveConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action when leaving zone</label>
                <select class="homey-form-input" id="leaveAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
                <label class="homey-form-label">Delay (seconds)</label>
                <input type="number" class="homey-form-input" id="leaveDelay" 
                       value="${rule?.config?.delay || 0}" min="0" max="300">
            </div>`;
    },

    getStayConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action while in zone</label>
                <select class="homey-form-input" id="stayAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
                <label class="homey-form-label">Check interval (seconds)</label>
                <input type="number" class="homey-form-input" id="stayInterval" 
                       value="${rule?.config?.interval || 60}" min="30" max="3600">
            </div>`;
    },

    async saveRule(type) {
        try {
            const config = await this.getRuleConfig(type);

            if (!config) {
                window.logError('[SAVE RULE] Invalid rule configuration');
                return;
            }

            const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
            if (!floor) throw new Error('Floor not found');

            const device = floor.devices.find(d => d.id === this.currentDeviceId);
            if (!device) throw new Error('Device not found');

            if (this.isEditing) {
                // Update existing rule
                const ruleIndex = device.rules.findIndex(r => r.id === this.currentRuleId);
                if (ruleIndex !== -1) {
                    // Only update the config, preserve other properties
                    device.rules[ruleIndex] = {
                        ...device.rules[ruleIndex],
                        config: config
                    };
                }
            } else {
                // Create new rule with UUID
                const newRule = {
                    id: generateUUID(),
                    type: type,
                    name: this.getRuleName(type),
                    config: config
                };
                
                device.rules.push(newRule);
            }

            // Save and update UI
            await this.floorManager.saveFloors();

            const rulesSection = document.getElementById(`rules-${this.currentDeviceId}`);
            if (rulesSection) {
                const rulesContent = rulesSection.querySelector('.floor-rules-content');
                if (rulesContent) {
                    rulesContent.innerHTML = this.renderRules(device);
                    this.floorManager.attachRuleEventListeners(rulesContent);
                }
            }

            // Reset and close dialog
            this.isEditing = false;
            this.currentRuleId = null;
            const dialog = document.getElementById('ruleDialog');
            if (dialog) {
                const configSection = dialog.querySelector('#ruleConfig');
                const typeSelect = dialog.querySelector('#ruleType');
                if (configSection) configSection.innerHTML = '';
                if (typeSelect) {
                    typeSelect.value = '';
                    typeSelect.disabled = false;
                }
                dialog.style.display = 'none';
            }
        } catch (err) {
            window.logError('[SAVE RULE] Failed to save rule:', err);
            this.Homey.alert('Failed to save rule: ' + err.message);
        }
    },

    async getRuleConfig(type) {
        try {
            if (type === 'allIcon') {
                const selectedIconElement = document.querySelector('.selected-icon .material-symbols-outlined');
                if (!selectedIconElement) {
                    console.warn('No icon selected when trying to save');
                    return null;
                }

                const selectedIcon = selectedIconElement.textContent;
                return {
                    selectedIcon
                };
            } else if (type === 'allColor') {
                const showIcon = document.getElementById('showIcon').checked;
                const showCloud = document.getElementById('showCloud').checked;
                
                return {
                    showIcon,
                    iconColor: showIcon ? document.getElementById('iconColor').value : null,
                    showCloud,
                    cloudColor: showCloud ? document.getElementById('cloudColor').value : null
                };
            } else if (type === 'onOffColor') {
                const showIconOn = document.getElementById('showIconOn').checked;
                const showCloudOn = document.getElementById('showCloudOn').checked;
                const showIconOff = document.getElementById('showIconOff').checked;
                const showCloudOff = document.getElementById('showCloudOff').checked;

                return {
                    showIconOn,
                    iconColorOn: showIconOn ? document.getElementById('iconColorOn').value : null,
                    showCloudOn,
                    cloudColorOn: showCloudOn ? document.getElementById('cloudColorOn').value : null,
                    showIconOff,
                    iconColorOff: showIconOff ? document.getElementById('iconColorOff').value : null,
                    showCloudOff,
                    cloudColorOff: showCloudOff ? document.getElementById('cloudColorOff').value : null
                };
            } else if (type === 'onOffImage') {
                const imagePreview = document.getElementById('ruleImagePreview').querySelector('img');
                const visibilitySelect = document.getElementById('imageVisibility');
                return {
                    imageData: imagePreview ? imagePreview.src : null,
                    showOn: visibilitySelect.value === 'on'
                };
            } else if (type === 'measureDisplay') {
                // Get elements
                const showTemperatureEl = document.getElementById('showTemperature');
                const temperatureColorEl = document.getElementById('temperatureColor');
                const showHumidityEl = document.getElementById('showHumidity');
                const humidityColorEl = document.getElementById('humidityColor');
                
                // Get values with fallbacks to default
                const showTemperature = showTemperatureEl ? showTemperatureEl.checked : true;
                const temperatureColor = showTemperature && temperatureColorEl ? temperatureColorEl.value : '#2196F3';
                const showHumidity = showHumidityEl ? showHumidityEl.checked : true;
                const humidityColor = showHumidity && humidityColorEl ? humidityColorEl.value : '#2196F3';
                
                return {
                    showTemperature,
                    temperatureColor: showTemperature ? temperatureColor : null,
                    showHumidity,
                    humidityColor: showHumidity ? humidityColor : null
                };
            } else if (type === 'alarmColor') {
                const showIconOn = document.getElementById('showIconOn').checked;
                const showCloudOn = document.getElementById('showCloudOn').checked;
                const showIconOff = document.getElementById('showIconOff').checked;
                const showCloudOff = document.getElementById('showCloudOff').checked;

                return {
                    showIconOn,
                    iconColorOn: showIconOn ? document.getElementById('iconColorOn').value : null,
                    showCloudOn,
                    cloudColorOn: showCloudOn ? document.getElementById('cloudColorOn').value : null,
                    showIconOff,
                    iconColorOff: showIconOff ? document.getElementById('iconColorOff').value : null,
                    showCloudOff,
                    cloudColorOff: showCloudOff ? document.getElementById('cloudColorOff').value : null
                };
            }

            return null;
        } catch (err) {
            window.logError('[GET RULE CONFIG] Error:', err);
            this.Homey.alert(err.message || 'Failed to get rule configuration');
            return null;
        }
    },

    deleteRule(deviceId, ruleId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        // Update dialog text for rule deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Delete Rule';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to delete this rule? This action cannot be undone.';

        // Show dialog
        dialog.style.display = 'flex';

        const handleDelete = async () => {
            try {
                const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
                if (!floor) return;

                const device = floor.devices.find(d => d.id === deviceId);
                if (!device) return;

                // Remove rule from device
                device.rules = device.rules.filter(r => r.id !== ruleId);

                await this.floorManager.saveFloors();

                // Update UI
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderRules(device);
                        this.floorManager.attachRuleEventListeners(rulesContent);
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                window.logError('[DELETE RULE] Failed to delete rule:', err);
                this.Homey.alert('Failed to delete rule');
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

    attachRuleEventListeners() {
        const ruleDialog = document.getElementById('rule-dialog');
        if (!ruleDialog) return;

        const checkboxes = ruleDialog.querySelectorAll('input[type="checkbox"]');
        const colorInputs = ruleDialog.querySelectorAll('input[type="color"]');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const settingsGroup = checkbox.closest('.settings-group');
                const colorInput = settingsGroup.querySelector('input[type="color"]');
                
                if (colorInput) {
                    colorInput.disabled = !checkbox.checked;
                    
                    if (!checkbox.checked) {
                        if (colorInput.id === 'iconColor') {
                            colorInput.value = '#00ff00';
                        } else if (colorInput.id === 'cloudColor') {
                            colorInput.value = '#00ff00';
                        } else if (colorInput.id === 'contrastColor') {
                            colorInput.value = '#ffffff';
                        }
                    }
                }
                
                document.getElementById('save-rule-button').disabled = false;
            });
        });

        colorInputs.forEach(colorInput => {
            colorInput.addEventListener('input', () => {
                document.getElementById('save-rule-button').disabled = false;
            });
        });

        this.updateColorInputStates();
        document.getElementById('save-rule-button').disabled = false;
    },

    cleanupEventListeners() {
        if (this.dialogElements) {
            if (this.dialogElements.checkboxes) {
                this.dialogElements.checkboxes.forEach(checkbox => {
                    checkbox.removeEventListener('change', this.boundHandlers.checkboxChange);
                });
            }
            if (this.dialogElements.colorInputs) {
                this.dialogElements.colorInputs.forEach(input => {
                    input.removeEventListener('input', this.boundHandlers.colorInput);
                });
            }
        }
        
        // Remove any direct event listeners for temperature and humidity
        const showTemperature = document.getElementById('showTemperature');
        const showHumidity = document.getElementById('showHumidity');
        
        if (showTemperature) {
            const newShowTemp = showTemperature.cloneNode(true);
            showTemperature.parentNode.replaceChild(newShowTemp, showTemperature);
        }
        
        if (showHumidity) {
            const newShowHumidity = showHumidity.cloneNode(true);
            showHumidity.parentNode.replaceChild(newShowHumidity, showHumidity);
        }
        
        this.dialogElements = null;
        this.boundHandlers = null;
    },

    handleColorInput(event) {
        if (this.dialogElements.saveButton) {
            this.dialogElements.saveButton.disabled = false;
        }
    },

    updateColorInputStates() {
        const ruleDialog = document.getElementById('rule-dialog');
        if (!ruleDialog) return;

        const settingsGroups = ruleDialog.querySelectorAll('.settings-group');
        
        settingsGroups.forEach(group => {
            const checkbox = group.querySelector('input[type="checkbox"]');
            const colorInput = group.querySelector('input[type="color"]');

            if (checkbox && colorInput) {
                colorInput.disabled = !checkbox.checked;
                
                if (!checkbox.checked) {
                    if (colorInput.id === 'iconColor') {
                        colorInput.value = '#00ff00';
                    } else if (colorInput.id === 'cloudColor') {
                        colorInput.value = '#00ff00';
                    } else if (colorInput.id === 'contrastColor') {
                        colorInput.value = '#ffffff';
                    }
                }
            }
        });
    },

    async searchMaterialIcons(searchTerm) {
        if (!Array.isArray(this.iconData)) {
            console.warn('⚠️ Icon data not properly loaded');
            return [];
        }

        try {
            searchTerm = searchTerm.toLowerCase();


            // First try exact matches in name
            let results = this.iconData
                .filter(icon => {
                    const name = (icon.name || '').toLowerCase();
                    return name.includes(searchTerm);
                })
                .map(icon => icon.name);
            // If no direct matches, try searching in tags
            if (results.length === 0) {
                results = this.iconData
                    .filter(icon => {
                        const tags = (icon.tags || []).map(tag => tag.toLowerCase());
                        return tags.some(tag => tag.includes(searchTerm));
                    })
                    .map(icon => icon.name);
                
            }

            // Remove duplicates and limit results to 3
            results = [...new Set(results)].slice(0, 3);

            // Sort results to prioritize matches at start of word
            results.sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                const aStartsWith = aLower.startsWith(searchTerm);
                const bStartsWith = bLower.startsWith(searchTerm);

                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return aLower.localeCompare(bLower);
            });

            return results;
        } catch (error) {
            window.logError('[SEARCH MATERIAL ICONS] Search failed:', error);
            return [];
        }
    },

    async initialize() {
        // Load icons from local file
        try {

            const response = await fetch('./assets/google-icons.json');
            if (!response.ok) {
                throw new Error('Failed to load icons');
            }

            const data = await response.json();
            // Extract icons array from the data structure
            this.iconData = data.icons || [];

        } catch (error) {
            window.logError('[INITIALIZE] Error loading Material Icons:', error);
            this.Homey.alert('Failed to load icons');
            this.iconData = [];
        }
    },
    
    initializeFormListeners() {
        // Create new rule button
        const createRuleBtn = document.getElementById('createRuleBtn');
        if (createRuleBtn) {
            createRuleBtn.addEventListener('click', () => {
                const deviceId = this.currentDeviceId;
                if (deviceId) {
                    this.addRule(deviceId);
                } else {
                    this.Homey.alert('No device selected');
                }
            });
        }
        
        // Save rule button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'saveRule') {
                const typeSelect = document.getElementById('ruleType');
                if (typeSelect && typeSelect.value) {
                    this.saveRule(typeSelect.value);
                }
            }
        });
        
        // Delete rule button
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-rule-btn')) {
                const deviceId = e.target.dataset.deviceId;
                const ruleId = e.target.dataset.ruleId;
                if (deviceId && ruleId) {
                    this.deleteRule(deviceId, ruleId);
                }
            }
        });
        
        // Rule type change
        const ruleTypeSelect = document.getElementById('ruleType');
        if (ruleTypeSelect) {
            ruleTypeSelect.addEventListener('change', (e) => {
                this.onRuleTypeChange(e.target.value);
                
                // Add special handling for temperature and humidity inputs
                setTimeout(() => {
                    const showTemperature = document.getElementById('showTemperature');
                    const temperatureColor = document.getElementById('temperatureColor');
                    const showHumidity = document.getElementById('showHumidity');
                    const humidityColor = document.getElementById('humidityColor');
                    
                    if (showTemperature && temperatureColor) {
                        showTemperature.addEventListener('change', (e) => {
                            temperatureColor.disabled = !e.target.checked;
                        });
                    }
                    
                    if (showHumidity && humidityColor) {
                        showHumidity.addEventListener('change', (e) => {
                            humidityColor.disabled = !e.target.checked;
                        });
                    }
                }, 100);
            });
        }
        
        // Direct document listener for temperature and humidity checkboxes
        document.addEventListener('change', (e) => {
            if (e.target.id === 'showTemperature') {
                const temperatureColor = document.getElementById('temperatureColor');
                if (temperatureColor) {
                    temperatureColor.disabled = !e.target.checked;
                }
            } else if (e.target.id === 'showHumidity') {
                const humidityColor = document.getElementById('humidityColor');
                if (humidityColor) {
                    humidityColor.disabled = !e.target.checked;
                }
            }
        });
    },
};

window.ruleManager = ruleManager; 