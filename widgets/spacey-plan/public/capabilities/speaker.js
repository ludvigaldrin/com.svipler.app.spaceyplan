const speakerRenderer = {
    id: 'speaker',
    lastClickTimes: new Map(),

    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = this.id + '-device';

        deviceEl.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 28px;
            height: 28px;
            z-index: 300;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            opacity: 0;
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 8px 1px rgba(255, 255, 255, 0.45);
            pointer-events: none;
        `;

        // Shared icon sizing rules (already added once by other renderers)
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
                    font-size: 18px;
                }
            `;
            if (document.head && styles) {
                document.head.appendChild(styles);
            }
        }

        if (!document.getElementById('speakerModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'speakerModalStyles';
            styles.textContent = `
                .speaker-value-label {
                    position: absolute;
                    top: 30px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(255, 255, 255, 0.92);
                    color: #1C1C1E;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 8px;
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                    z-index: 301;
                }
                .speaker-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .speaker-modal {
                    background: rgba(245, 245, 245, 0.97);
                    border-radius: 15px;
                    padding: 20px;
                    width: 260px;
                    max-width: 90vw;
                    text-align: center;
                    font-family: inherit;
                }
                .speaker-modal h2 {
                    margin: 0 0 4px 0;
                    font-size: 16px;
                    color: #333;
                }
                .speaker-modal .speaker-volume-label {
                    margin: 0 0 16px 0;
                    font-size: 13px;
                    color: #666;
                }
                .speaker-modal .speaker-track-label {
                    margin: 0 0 10px 0;
                    font-size: 13px;
                    font-weight: 600;
                    color: #333;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .speaker-slider-track {
                    position: relative;
                    height: 36px;
                    border-radius: 18px;
                    background: #dcdcdc;
                    margin-bottom: 18px;
                    touch-action: none;
                    cursor: pointer;
                }
                .speaker-slider-fill {
                    position: absolute;
                    top: 0; left: 0; bottom: 0;
                    border-radius: 18px;
                    background: #8e44ad;
                    pointer-events: none;
                }
                .speaker-slider-thumb {
                    position: absolute;
                    top: 50%;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    background: #fff;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                }
                .speaker-transport-buttons {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .speaker-transport-buttons button {
                    flex: 1;
                    padding: 10px 0;
                    border: none;
                    border-radius: 9px;
                    font-size: 13px;
                    cursor: pointer;
                    background: #e0e0e0;
                    color: #333;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .speaker-transport-buttons .material-symbols-outlined {
                    font-size: 20px;
                }
                .speaker-modal-close {
                    padding: 9px 20px;
                    border: none;
                    border-radius: 9px;
                    font-size: 14px;
                    cursor: pointer;
                    background: #dcdcdc;
                    color: #333;
                }
                .speaker-flow-button {
                    width: 100%;
                    padding: 10px 0;
                    margin-bottom: 12px;
                    border: none;
                    border-radius: 9px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    background: #8e44ad;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
                .speaker-flow-button .material-symbols-outlined {
                    font-size: 18px;
                }
                .speaker-flow-button:disabled {
                    opacity: 0.6;
                    cursor: default;
                }
            `;
            if (document.head && styles) {
                document.head.appendChild(styles);
            }
        }

        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-homey-id', device.homeyId);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-state', device.state || false);
        deviceEl.setAttribute('data-volume', device.speakerVolume ?? 0);
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'icon-wrapper';

        if (device.iconObj) {
            const img = document.createElement('img');
            if (device.iconObj.base64) {
                img.src = device.iconObj.base64;
            } else if (device.iconObj.url) {
                img.src = device.iconObj.url;
            }
            img.className = 'device-icon';
            img.style.pointerEvents = 'auto';
            img.style.cursor = 'pointer';
            img.style.userSelect = 'none';
            img.style.webkitUserSelect = 'none';
            img.style.webkitTouchCallout = 'none';

            if (iconWrapper && img) {
                iconWrapper.appendChild(img);
            }
        }

        if (deviceEl && iconWrapper) {
            deviceEl.appendChild(iconWrapper);
        }

        // Always-visible volume label below the icon
        const valueLabel = document.createElement('div');
        valueLabel.className = 'speaker-value-label';
        const initialVolume = device.speakerVolume;
        valueLabel.textContent = (initialVolume !== undefined && initialVolume !== null)
            ? `${Math.round(initialVolume * 100)}%`
            : '…';
        if (deviceEl && valueLabel) {
            deviceEl.appendChild(valueLabel);
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
                        let imageWidth, imageHeight;

                        if (wrapperRect.width / wrapperRect.height > currentImageAspectRatio) {
                            imageHeight = wrapperRect.height;
                            imageWidth = imageHeight * currentImageAspectRatio;
                        } else {
                            imageWidth = wrapperRect.width;
                            imageHeight = imageWidth / currentImageAspectRatio;
                        }

                        displayX = (position.x / 100) * imageWidth;
                        displayY = (position.y / 100) * imageHeight;

                        if (imageWidth < wrapperRect.width) {
                            displayX += (wrapperRect.width - imageWidth) / 2;
                        }
                        if (imageHeight < wrapperRect.height) {
                            displayY += (wrapperRect.height - imageHeight) / 2;
                        }
                    } else {
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

        positionDevice().catch(error => {
            Homey.api('POST', '/error', { message: `Error positioning speaker device: ${JSON.stringify(error)}` });
        });

        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/speaker`);

            if (response !== undefined && response !== null) {
                const playing = response.playing === true;
                const volume = typeof response.volume === 'number' ? response.volume : 0;

                deviceEl.setAttribute('data-state', playing);
                deviceEl.setAttribute('data-volume', volume);
                deviceEl.setAttribute('data-track', response.track || '');
                deviceEl.setAttribute('data-artist', response.artist || '');
                deviceEl.classList.toggle('on', playing);

                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.state = playing;
                deviceData.speakerVolume = volume;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                this.applyInitialRules(deviceData, deviceEl);
                this.renderVolumeLabel(deviceEl, volume);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [
                    { deviceId: deviceId, capability: 'speaker_playing' },
                    { deviceId: deviceId, capability: 'volume_set' },
                    { deviceId: deviceId, capability: 'speaker_track' },
                    { deviceId: deviceId, capability: 'speaker_artist' }
                ]
            });

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in speaker initializeState: ${JSON.stringify(error)}` });
        }
    },

    initializeInteractions(deviceEl) {
        if (!deviceEl || !deviceEl.addEventListener) {
            return;
        }

        const icon = deviceEl.querySelector('.device-icon, .material-symbols-outlined');
        if (icon) {
            this.attachIconEvents(icon, deviceEl);
        }
    },

    attachIconEvents(icon, deviceEl) {
        if (!icon) return;

        let pressStartTime = 0;
        let moved = false;
        let longPressFired = false;
        let startX = 0;
        let startY = 0;
        let longPressTimer = null;
        const TOLERANCE = 18;
        const LONG_PRESS_MS = 500;

        const restoreVisuals = () => {
            deviceEl.style.transition = '';
            deviceEl.style.opacity = '1';
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
        };

        const start = (clientX, clientY) => {
            pressStartTime = Date.now();
            moved = false;
            longPressFired = false;
            startX = clientX;
            startY = clientY;

            deviceEl.style.transition = 'none';
            deviceEl.style.opacity = '0.8';

            longPressTimer = setTimeout(() => {
                if (moved) return;
                longPressFired = true;
                deviceEl.style.transform = this.addScaleTransform(deviceEl, 1.15);
                restoreVisuals();
                this.showVolumeModal(deviceEl);
            }, LONG_PRESS_MS);
        };

        const move = (clientX, clientY) => {
            const dx = Math.abs(clientX - startX);
            const dy = Math.abs(clientY - startY);
            if (dx > TOLERANCE || dy > TOLERANCE) {
                moved = true;
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }
        };

        const end = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (longPressFired) {
                return;
            }

            restoreVisuals();

            const pressDuration = Date.now() - pressStartTime;
            if (!moved && pressDuration < LONG_PRESS_MS) {
                this.handleClick(deviceEl);
            }
        };

        const cancel = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (!longPressFired) {
                restoreVisuals();
            }
        };

        icon.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = e.touches[0];
            if (t) start(t.clientX, t.clientY);
        }, { passive: false });

        icon.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = e.touches[0];
            if (t) move(t.clientX, t.clientY);
        }, { passive: false });

        icon.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            end();
        }, { passive: false });

        icon.addEventListener('touchcancel', () => {
            cancel();
        }, { passive: true });

        icon.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            start(e.clientX, e.clientY);

            const onMove = (ev) => move(ev.clientX, ev.clientY);
            const onUp = () => {
                end();
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        icon.addEventListener('contextmenu', (e) => e.preventDefault());

        icon.style.pointerEvents = 'auto';
        icon.style.cursor = 'pointer';
        icon.style.userSelect = 'none';
        icon.style.webkitUserSelect = 'none';
        icon.style.webkitTouchCallout = 'none';

        if (icon.tagName.toLowerCase() === 'img') {
            icon.draggable = false;
            icon.addEventListener('dragstart', (e) => e.preventDefault());
        }
    },

    // Short tap: toggle play/pause
    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-homey-id');
            const now = Date.now();
            const lastClickTime = this.lastClickTimes.get(deviceId) || 0;

            if (now - lastClickTime < 500) {
                return;
            }
            this.lastClickTimes.set(deviceId, now);

            const currentlyPlaying = deviceEl.getAttribute('data-state') === 'true';
            const targetPlaying = !currentlyPlaying;

            // Optimistic UI update
            this.handleDeviceUpdate(deviceEl, targetPlaying, 'speaker_playing');

            try {
                await Homey.api('PUT', `/devices/${deviceId}/capabilities/speaker`, {
                    value: { action: 'playing', value: targetPlaying }
                });
            } catch (error) {
                this.handleDeviceUpdate(deviceEl, currentlyPlaying, 'speaker_playing');
                throw error;
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in speaker handleClick: ${JSON.stringify(error)}` });
        }
    },

    async setVolume(deviceEl, deviceId, volume) {
        try {
            this.renderVolumeLabel(deviceEl, volume);
            deviceEl.setAttribute('data-volume', volume);

            await Homey.api('PUT', `/devices/${deviceId}/capabilities/speaker`, {
                value: { action: 'volume', value: volume }
            });
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error setting speaker volume: ${JSON.stringify(error)}` });
        }
    },

    async sendTransport(deviceId, action) {
        try {
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/speaker`, {
                value: { action }
            });
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error sending speaker ${action}: ${JSON.stringify(error)}` });
        }
    },

    showVolumeModal(deviceEl) {
        if (document.querySelector('.speaker-modal-overlay')) return;

        const deviceId = deviceEl.getAttribute('data-homey-id');
        const name = deviceEl.getAttribute('data-name');
        let volume = parseFloat(deviceEl.getAttribute('data-volume')) || 0;

        const deviceData = JSON.parse(deviceEl.getAttribute('data-device') || '{}');
        const flowRule = deviceData.rules?.find(r => r.type === 'flowTrigger');

        const overlay = document.createElement('div');
        overlay.className = 'speaker-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'speaker-modal';
        modal.innerHTML = `
            <h2>${name}</h2>
            <p class="speaker-track-label"></p>
            <p class="speaker-volume-label">${Math.round(volume * 100)}% volume</p>
            <div class="speaker-slider-track">
                <div class="speaker-slider-fill"></div>
                <div class="speaker-slider-thumb"></div>
            </div>
            <div class="speaker-transport-buttons">
                <button type="button" data-action="prev"><span class="material-symbols-outlined">skip_previous</span></button>
                <button type="button" data-action="next"><span class="material-symbols-outlined">skip_next</span></button>
            </div>
            ${flowRule?.config ? `
            <button type="button" class="speaker-flow-button">
                <span class="material-symbols-outlined">play_circle</span>
                ${flowRule.config.buttonLabel || 'Run Flow'}
            </button>
            ` : ''}
            <button type="button" class="speaker-modal-close">Done</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const track = modal.querySelector('.speaker-slider-track');
        const fill = modal.querySelector('.speaker-slider-fill');
        const thumb = modal.querySelector('.speaker-slider-thumb');
        const label = modal.querySelector('.speaker-volume-label');

        const renderSlider = (vol) => {
            const pct = Math.max(0, Math.min(1, vol)) * 100;
            fill.style.width = `${pct}%`;
            thumb.style.left = `${pct}%`;
            label.textContent = `${Math.round(pct)}% volume`;
        };
        renderSlider(volume);
        this.renderTrackLabel(deviceEl);

        let dragging = false;

        const posFromEvent = (clientX) => {
            const rect = track.getBoundingClientRect();
            const ratio = (clientX - rect.left) / rect.width;
            return Math.max(0, Math.min(1, ratio));
        };

        const onDragMove = (clientX) => {
            volume = posFromEvent(clientX);
            renderSlider(volume);
        };

        track.addEventListener('mousedown', (e) => {
            dragging = true;
            onDragMove(e.clientX);
            const onMove = (ev) => dragging && onDragMove(ev.clientX);
            const onUp = async () => {
                dragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                await this.setVolume(deviceEl, deviceId, volume);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        track.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            onDragMove(e.touches[0].clientX);
        }, { passive: false });

        track.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragging) onDragMove(e.touches[0].clientX);
        }, { passive: false });

        track.addEventListener('touchend', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dragging) return;
            dragging = false;
            await this.setVolume(deviceEl, deviceId, volume);
        }, { passive: false });

        modal.querySelector('[data-action="prev"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendTransport(deviceId, 'prev');
        });
        modal.querySelector('[data-action="next"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendTransport(deviceId, 'next');
        });

        const flowButton = modal.querySelector('.speaker-flow-button');
        if (flowButton && flowRule?.config) {
            flowButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                flowButton.disabled = true;
                try {
                    await Homey.api('PUT', `/devices/${deviceId}/capabilities/speaker`, {
                        value: { action: 'triggerFlow' }
                    });
                } catch (error) {
                    Homey.api('POST', '/error', { message: `Error running speaker flow: ${JSON.stringify(error)}` });
                } finally {
                    flowButton.disabled = false;
                }
            });
        }

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        modal.querySelector('.speaker-modal-close').addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    },

    // Updates the track/artist line shown at the top of an open volume modal.
    renderTrackLabel(deviceEl) {
        const modal = document.querySelector('.speaker-modal-overlay');
        if (!modal) return;

        const trackLabel = modal.querySelector('.speaker-track-label');
        if (!trackLabel) return;

        const track = deviceEl.getAttribute('data-track') || '';
        const artist = deviceEl.getAttribute('data-artist') || '';

        if (!track) {
            trackLabel.textContent = '';
            trackLabel.style.display = 'none';
            return;
        }

        trackLabel.textContent = artist ? `${track} — ${artist}` : track;
        trackLabel.style.display = 'block';
    },

    renderVolumeLabel(deviceEl, volume) {
        const label = deviceEl.querySelector('.speaker-value-label');
        if (label) {
            label.textContent = `${Math.round(Math.max(0, Math.min(1, volume)) * 100)}%`;
        }

        // Keep an open modal's slider/label in sync too
        const modal = document.querySelector('.speaker-modal-overlay');
        if (modal) {
            const fill = modal.querySelector('.speaker-slider-fill');
            const thumb = modal.querySelector('.speaker-slider-thumb');
            const modalLabel = modal.querySelector('.speaker-volume-label');
            if (fill && thumb && modalLabel) {
                const pct = Math.max(0, Math.min(1, volume)) * 100;
                fill.style.width = `${pct}%`;
                thumb.style.left = `${pct}%`;
                modalLabel.textContent = `${Math.round(pct)}% volume`;
            }
        }
    },

    // Realtime updates from Homey (speaker_playing or volume_set changes)
    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            if (capability === 'volume_set') {
                deviceEl.setAttribute('data-volume', value);
                this.renderVolumeLabel(deviceEl, value);
                return;
            }

            if (capability === 'speaker_track' || capability === 'speaker_artist') {
                deviceEl.setAttribute(capability === 'speaker_track' ? 'data-track' : 'data-artist', value || '');
                this.renderTrackLabel(deviceEl);
                return;
            }

            // capability === 'speaker_playing' (or our own optimistic update)
            const playing = value === true;

            deviceEl.setAttribute('data-state', playing);
            deviceEl.classList.toggle('on', playing);

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.state = playing;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            const iconWrapper = deviceEl.querySelector('.icon-wrapper');

            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
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

            const onOffColorRule = deviceData.rules?.find(r => r.type === 'onOffColor');
            if (!allColorRule && onOffColorRule?.config) {
                const currentColor = playing ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = playing ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = playing ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = playing ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                if (showCloud && currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }
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
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in speaker handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');
            const currentState = device.state === true;

            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            const allIconRule = device.rules?.find(r => r.type === 'allIcon');
            if (allIconRule?.config?.selectedIcon) {
                if (iconWrapper) {
                    iconWrapper.innerHTML = '';
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined';
                    iconSpan.textContent = allIconRule.config.selectedIcon;
                    if (iconWrapper && iconSpan) {
                        iconWrapper.appendChild(iconSpan);
                        this.attachIconEvents(iconSpan, deviceEl);
                    }
                    iconWrapper.style.display = 'flex';
                    iconSpan.style.fontSize = '18px';
                }
            }

            const allColorRule = device.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-all-color', allColorRule.config.cloudColor || allColorRule.config.mainColor);

                if (allColorRule.config.showCloud) {
                    const color = allColorRule.config.cloudColor || allColorRule.config.mainColor;
                    deviceEl.style.backgroundColor = `${color}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${color}90`;
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${color}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${color}E0`;
                    }
                }

                if (iconWrapper) {
                    if (!allColorRule.config.showIcon) {
                        iconWrapper.style.opacity = '0';
                    } else {
                        iconWrapper.style.opacity = '1';
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

            const onOffColorRule = device.rules?.find(r => r.type === 'onOffColor');
            if (!allColorRule && onOffColorRule?.config) {
                const currentColor = currentState ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = currentState ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = currentState ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = currentState ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', onOffColorRule.config.cloudColorOn);
                deviceEl.setAttribute('data-off-color', onOffColorRule.config.cloudColorOff);

                if (showCloud) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                if (iconWrapper) {
                    if (!showIcon) {
                        iconWrapper.style.opacity = '0';
                    } else {
                        iconWrapper.style.opacity = '1';
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
            Homey.api('POST', '/error', { message: `Error in speaker applyInitialRules: ${JSON.stringify(error)}` });
        }
    },

    // Helper to add/remove a scale transform without touching the base
    // translate() used for positioning on the floor plan.
    addScaleTransform(element, scale) {
        const currentTransform = element.style.transform;
        if (currentTransform.includes('scale(')) {
            return currentTransform.replace(/scale\([^)]+\)/, `scale(${scale})`);
        }
        return `${currentTransform} scale(${scale})`;
    },

    removeScaleTransform(element) {
        const currentTransform = element.style.transform;
        return currentTransform.replace(/\s*scale\([^)]+\)/, '');
    }
};

// Register the renderer
window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.speaker = speakerRenderer;
