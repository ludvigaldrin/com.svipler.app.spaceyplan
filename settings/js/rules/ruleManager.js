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
        imageView: { name: 'On/Off - Image Switcher', allowMultiple: true }
    },

    init(floorManager, Homey) {
        this.floorManager = floorManager;
        this.Homey = Homey;
        this.attachImageUploadHandlers();
        this.initialize();
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
                const preview = document.getElementById('ruleImagePreview');
                preview.innerHTML = `
                    <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                        <img src="${imageData}" style="width: 100%; height: auto; object-fit: contain;">
                    </div>`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    getRuleName(type) {
        return this.RULE_TYPES[type]?.name || 'New Rule';
    },

    renderRuleConfig(ruleType, existingRule = null) {
        if (ruleType === 'allIcon') {
            return `
                <div class="rule-config-group">
                    <div class="icon-search-container">
                        <h3>Search Icons</h3>
                        <div class="search-input-group">
                            <input type="text" 
                                   id="iconSearch" 
                                   class="homey-form-input" 
                                   placeholder="Type to search Material Icons...">
                        </div>
                        <div id="searchResults" class="icon-search-results"></div>
                    </div>

                    <div id="selectedIconDisplay" class="selected-icon-container">
                        <h3>Selected Icon</h3>
                        <div class="selected-icon-box">
                            ${existingRule?.config?.selectedIcon ? `
                                <div class="selected-icon">
                                    <span class="material-symbols-outlined">${existingRule.config.selectedIcon}</span>
                                    <span class="icon-name">${existingRule.config.selectedIcon}</span>
                                </div>
                            ` : `
                                <div class="no-icon-selected">
                                    No icon selected. Search above to find an icon.
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        } else if (ruleType === 'allColor') {
            return `
                <div class="rule-config-group">
                    <div class="icon-settings">
                        <div class="settings-header">
                            <h3>Icon Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showIcon" 
                                    ${existingRule?.config?.showIcon !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Icon Color</label>
                            <input type="color" id="iconColor" 
                                value="${existingRule?.config?.iconColor || '#00ff00'}"
                                ${existingRule?.config?.showIcon === false ? 'disabled' : ''}>
                        </div>
                    </div>

                    <div class="cloud-settings">
                        <div class="settings-header">
                            <h3>Cloud Effect Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showCloud" 
                                    ${existingRule?.config?.showCloud !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Cloud Color</label>
                            <input type="color" id="cloudColor" 
                                value="${existingRule?.config?.cloudColor || '#00ff00'}"
                                ${existingRule?.config?.showCloud === false ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>
            `;
        } else if (ruleType === 'onOffColor') {
            return `
                <div class="rule-config-group">
                    <div class="icon-settings">
                        <div class="settings-header">
                            <h3>On - Icon Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showIconOn" 
                                    ${existingRule?.config?.showIconOn !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Icon Color</label>
                            <input type="color" id="iconColorOn" 
                                value="${existingRule?.config?.iconColorOn || '#ffeb3b'}"
                                ${existingRule?.config?.showIconOn === false ? 'disabled' : ''}>
                        </div>
                        <div class="settings-note">
                            Note: Not all icons allow for color change
                        </div>
                    </div>

                    <div class="cloud-settings">
                        <div class="settings-header">
                            <h3>On - Cloud Effect Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showCloudOn" 
                                    ${existingRule?.config?.showCloudOn !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Cloud Color</label>
                            <input type="color" id="cloudColorOn" 
                                value="${existingRule?.config?.cloudColorOn || '#ffeb3b'}"
                                ${existingRule?.config?.showCloudOn === false ? 'disabled' : ''}>
                        </div>
                    </div>

                    <div class="icon-settings">
                        <div class="settings-header">
                            <h3>Off - Icon Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showIconOff" 
                                    ${existingRule?.config?.showIconOff !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Icon Color</label>
                            <input type="color" id="iconColorOff" 
                                value="${existingRule?.config?.iconColorOff || '#ffffff'}"
                                ${existingRule?.config?.showIconOff === false ? 'disabled' : ''}>
                        </div>
                        <div class="settings-note">
                            Note: Not all icons allow for color change
                        </div>
                    </div>

                    <div class="cloud-settings">
                        <div class="settings-header">
                            <h3>Off - Cloud Effect Settings</h3>
                            <label class="switch">
                                <input type="checkbox" id="showCloudOff" 
                                    ${existingRule?.config?.showCloudOff !== false ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div class="color-input-group">
                            <label>Cloud Color</label>
                            <input type="color" id="cloudColorOff" 
                                value="${existingRule?.config?.cloudColorOff || '#ffffff'}"
                                ${existingRule?.config?.showCloudOff === false ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>
            `;
        } else if (ruleType === 'imageView') {
            return `
                <div class="image-rule-config">
                    <div class="image-upload-group">
                        <label>Image</label>
                        <input type="file" id="ruleImage" accept="image/*" class="homey-form-input">
                        <div id="ruleImagePreview" class="image-preview">
                            ${existingRule?.config?.imageData ? `<img src="${existingRule.config.imageData}">` : ''}
                        </div>
                    </div>
                    <div class="visibility-options">
                        <label>Show image when device is:</label>
                        <select id="imageVisibility" class="homey-form-input">
                            <option value="on" ${existingRule?.config?.showOn ? 'selected' : ''}>On</option>
                            <option value="off" ${!existingRule?.config?.showOn ? 'selected' : ''}>Off</option>
                        </select>
                    </div>
                </div>
            `;
        }
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
                    <button class="icon-button delete-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}" title="Delete">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#666" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    },

    getRuleTypeName(type) {
        const types = {
            onEnter: 'On Enter',
            onLeave: 'On Leave',
            onStay: 'While Present'
        };
        return types[type] || type;
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
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

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
                dialog.style.display = 'none';
            };
        }
        if (cancelButton) {
            cancelButton.onclick = () => {
                dialog.style.display = 'none';
            };
        }

        // Get existing rule types for this device
        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) return;

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) return;

        // Filter available rule types based on existing rules
        const existingRuleTypes = device.rules.map(r => r.type);
        const availableTypes = Object.entries(this.RULE_TYPES)
            .filter(([type, config]) => 
                config.allowMultiple || !existingRuleTypes.includes(type)
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

            configSection.innerHTML = this.renderRuleConfig(ruleType);
            
            if (ruleType === 'allIcon') {
                this.attachRuleEventListeners();
            }
            
            saveButton.disabled = ruleType === 'allIcon';
        };

        dialog.style.display = 'flex';
    },

    editRule(deviceId, ruleId) {
        const dialog = document.getElementById('ruleDialog');
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) return;

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) return;

        const rule = device.rules.find(r => r.id === ruleId);
        if (!rule) return;

        // Store IDs and set edit mode
        this.currentDeviceId = deviceId;
        this.currentRuleId = ruleId;
        this.isEditing = true;

        // Update dialog elements
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');
        const closeButton = dialog.querySelector('.modal-close-button');
        const cancelButton = dialog.querySelector('#cancelRule');

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

        if (titleElement) titleElement.textContent = 'Edit Rule';
        if (saveButton) {
            saveButton.textContent = 'Save Changes';
            saveButton.disabled = false;
            saveButton.onclick = () => this.saveRule(rule.type);
        }

        // Set rule type
        if (typeSelect) {
            typeSelect.innerHTML = `<option value="${rule.type}">${this.getRuleName(rule.type)}</option>`;
            typeSelect.value = rule.type;
            typeSelect.disabled = true;
        }

        configSection.innerHTML = this.renderRuleConfig(rule.type, rule);
        
        if (rule.type === 'allIcon') {
            this.attachRuleEventListeners();
        }

        dialog.style.display = 'flex';
    },

    onRuleTypeChange(type, existingRule = null) {
        const configSection = document.getElementById('ruleConfig');
        if (!configSection) return;

        configSection.innerHTML = this.getRuleConfigHTML(type, existingRule);
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
                console.error('Invalid rule configuration');
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
                    device.rules[ruleIndex] = {
                        ...device.rules[ruleIndex],
                        config: config
                    };
                }
            } else {
                // Create new rule
                const newRule = {
                    id: Date.now().toString(),
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
            console.error('Failed to save rule:', err);
            this.Homey.alert('Failed to save rule');
        }
    },

    async getRuleConfig(ruleType) {
        if (ruleType === 'allIcon') {
            const selectedIconElement = document.querySelector('.selected-icon .material-symbols-outlined');
            if (!selectedIconElement) {
                console.warn('No icon selected when trying to save');
                return null;
            }

            const selectedIcon = selectedIconElement.textContent;
            return {
                selectedIcon
            };
        } else if (ruleType === 'allColor') {
            const showIcon = document.getElementById('showIcon').checked;
            const showCloud = document.getElementById('showCloud').checked;

            return {
                showIcon,
                iconColor: showIcon ? document.getElementById('iconColor').value : null,
                showCloud,
                cloudColor: showCloud ? document.getElementById('cloudColor').value : null
            };
        } else if (ruleType === 'onOffColor') {
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
        } else if (ruleType === 'imageView') {
            const imagePreview = document.getElementById('ruleImagePreview').querySelector('img');
            const visibilitySelect = document.getElementById('imageVisibility');
            return {
                imageData: imagePreview ? imagePreview.src : null,
                showOn: visibilitySelect.value === 'on'
            };
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
                console.error('Failed to delete rule:', err);
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

        
        const ruleDialog = document.getElementById('ruleDialog');
        if (!ruleDialog) {
            console.error('Rule dialog not found');
            return;
        }

        const searchInput = ruleDialog.querySelector('#iconSearch');
        const resultsDiv = ruleDialog.querySelector('#searchResults');
        const selectedIconDisplay = ruleDialog.querySelector('.selected-icon-box');
        const saveButton = ruleDialog.querySelector('#saveRule');

        if (searchInput && resultsDiv) {
            let debounceTimeout;
            
            const handleSearch = async () => {
                const searchTerm = searchInput.value.trim();
                
                // Clear results if search is empty
                if (!searchTerm) {
                    resultsDiv.innerHTML = '<div class="no-results">Type to search icons...</div>';
                    return;
                }

                // Show loading state
                resultsDiv.innerHTML = '<div class="loading-state">Searching icons...</div>';

                try {
                    const icons = await this.searchMaterialIcons(searchTerm);
                    
                    if (icons.length === 0) {

                        resultsDiv.innerHTML = '<div class="no-results">No matching icons found</div>';
                        return;
                    }

                    resultsDiv.innerHTML = icons.map(icon => `
                        <div class="icon-result" data-icon="${icon}">
                            <span class="material-symbols-outlined">${icon}</span>
                            <span class="icon-name">${icon}</span>
                        </div>
                    `).join('');

                    // Add click handlers
                    resultsDiv.querySelectorAll('.icon-result').forEach(el => {
                        el.addEventListener('click', () => {
                            const selectedIcon = el.dataset.icon;
      
                            selectedIconDisplay.innerHTML = `
                                <div class="selected-icon">
                                    <span class="material-symbols-outlined">${selectedIcon}</span>
                                    <span class="icon-name">${selectedIcon}</span>
                                </div>`;
                            
                            if (saveButton) {
                                saveButton.disabled = false;
                            }
                            resultsDiv.innerHTML = '';
                            searchInput.value = '';
                        });
                    });
                } catch (error) {
                    console.error('Search failed:', error);
                    resultsDiv.innerHTML = '<div class="error-state">Failed to search icons</div>';
                }
            };

            // Trigger search on input with 250ms debounce
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    handleSearch();
                }, 250);
            });

            // Initial state
            resultsDiv.innerHTML = '<div class="no-results">Type to search icons...</div>';
        } else {
            console.error('Required elements not found:', {
                searchInput: !!searchInput,
                resultsDiv: !!resultsDiv
            });
        }
    },

    async searchMaterialIcons(searchTerm) {
        
        if (!this.iconData) {
            console.warn('⚠️ Icon data not loaded');
            return [];
        }

        const results = this.iconData
            .filter(icon => 
                icon.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (icon.tags && icon.tags.some(tag => 
                    tag.toLowerCase().includes(searchTerm.toLowerCase())
                ))
            )
            .map(icon => icon.name)
            .slice(0, 3);
        return results;
    },

    async initialize() {
        // Fetch icons data on initialization
        try {
            const response = await fetch(`https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=1`);
            if (!response.ok) {
                throw new Error('Failed to fetch icons');
            }

            const text = await response.text();
            const cleanJson = text.replace(/^\)\]\}'\n/, '');
            const data = JSON.parse(cleanJson);
            this.iconData = data.icons;

        } catch (error) {
            console.error('Error loading Material Icons:', error);
            this.iconData = [];
        }
    },

    // Update the default rule configuration for new devices
    createDefaultRule() {
        return {
            id: Date.now().toString(),
            type: 'onOffColor',
            name: this.getRuleName('onOffColor'),
            config: {
                showIconOn: true,
                iconColorOn: '#ffeb3b',
                showCloudOn: true,
                cloudColorOn: '#ffeb3b',
                showIconOff: true,
                iconColorOff: '#ffffff',
                showCloudOff: true,
                cloudColorOff: '#ffffff'
            }
        };
    }
};

window.ruleManager = ruleManager; 