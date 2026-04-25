/* ============================================================
   AuraStream — Main Application Controller
   Orchestrates UI, audio engine, visualizer, weather, and
   AI features (Gemini Vibe Architect + TTS PA System).
   ============================================================ */

(function () {
    'use strict';

    // ======================== CONFIG ========================
    // Copy values from .env file before running
    const GEMINI_API_KEY  = 'YOUR_GEMINI_API_KEY'; // See .env file

    const BACKEND_URL = 'YOUR_BACKEND_URL'; // Colab backend via ngrok (see .env)

    // ======================== VIBE DEFINITIONS ========================
    const VIBES = [
        {
            id: 'morning-cafe',
            name: 'Morning Cafe',
            icon: '☕',
            prompt: 'lo-fi hip hop, chill beats, rhodes electric piano, 80bpm, no vocals, relaxing background music, warm, cozy',
            gradient: 'linear-gradient(135deg, #b45309, #f97316)',
            color: '#f97316'
        },
        {
            id: 'high-end-retail',
            name: 'High-End Retail',
            icon: '🛍️',
            prompt: 'upbeat deep house, lounge, 115bpm, fashion runway vibe, crisp bass, no vocals, modern, polished',
            gradient: 'linear-gradient(135deg, #9333ea, #4f46e5)',
            color: '#9333ea'
        },
        {
            id: 'zen-spa',
            name: 'Zen Spa',
            icon: '🧘',
            prompt: 'ambient drone, singing bowls, soft synthesizer, gentle water sounds, 60bpm, extremely relaxing, meditation, no drums',
            gradient: 'linear-gradient(135deg, #059669, #14b8a6)',
            color: '#14b8a6'
        },
        {
            id: 'busy-gym',
            name: 'Busy Gym',
            icon: '🏋️',
            prompt: 'electronic dance music, high energy, driving bass, 128bpm, motivational, powerful drops, no vocals',
            gradient: 'linear-gradient(135deg, #dc2626, #f43f5e)',
            color: '#f43f5e'
        },
        {
            id: 'evening-lounge',
            name: 'Evening Lounge',
            icon: '🍸',
            prompt: 'smooth jazz, soft piano, muted trumpet, 90bpm, cocktail bar, sophisticated, warm lighting, no vocals',
            gradient: 'linear-gradient(135deg, #2563eb, #06b6d4)',
            color: '#06b6d4'
        },
        {
            id: 'bookstore',
            name: 'Bookstore',
            icon: '📚',
            prompt: 'classical piano, ambient, gentle strings, 70bpm, intellectual, calm, scholarly atmosphere, no vocals',
            gradient: 'linear-gradient(135deg, #d97706, #eab308)',
            color: '#eab308'
        }
    ];

    // ======================== STATE ========================
    // Load saved custom vibes from localStorage
    function loadCustomVibes() {
        try {
            const saved = localStorage.getItem('aura_custom_vibes');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    }

    function saveCustomVibes() {
        const custom = state.vibes.filter(v => v.isCustom);
        localStorage.setItem('aura_custom_vibes', JSON.stringify(custom));
    }

    let state = {
        activeVibe: null,
        isPlaying: false,
        progress: 0,
        trackCount: 0,
        weather: null,
        weatherModifier: '',
        vibes: [...VIBES, ...loadCustomVibes()]
    };

    // ======================== DOM REFS ========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {};

    function cacheDom() {
        dom.vibeGrid = $('#vibe-grid');
        dom.playBtn = $('#play-btn');
        dom.playIcon = $('#play-icon');
        dom.skipBtn = $('#skip-btn');
        dom.volumeSlider = $('#volume-slider');
        dom.playerVibeName = $('#player-vibe-name');
        dom.statusText = $('#status-text');
        dom.statusCore = $('#status-core');
        dom.statusRing = $('#status-ring');
        dom.genStatus = $('#generation-status');
        dom.progressFill = $('#progress-fill');
        dom.trackCounter = $('#track-counter');
        dom.trackTime = $('#track-time');
        dom.customVibeInput = $('#custom-vibe-input');
        dom.generateVibeBtn = $('#generate-vibe-btn');
        dom.generateLabel = $('#generate-label');
        dom.announcementInput = $('#announcement-input');
        dom.broadcastBtn = $('#broadcast-btn');
        dom.broadcastLabel = $('#broadcast-label');

        dom.clearCacheBtn = $('#clear-cache-btn');
        dom.clearCacheLabel = $('#clear-cache-label');
    }

    // ======================== MODULES ========================
    let visualizer, audioEngine;

    // ======================== INDEXEDDB AUDIO CACHE ========================
    const audioCache = {
        DB_NAME: 'aurastream-cache',
        DB_VERSION: 1,
        STORE_NAME: 'clips',
        db: null,

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('vibeId', 'vibeId', { unique: false });
                    }
                };
                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    console.log('[Cache] IndexedDB ready');
                    resolve();
                };
                request.onerror = (e) => {
                    console.warn('[Cache] IndexedDB failed:', e);
                    resolve(); // Don't block app startup
                };
            });
        },

        async saveClip(vibeId, blob) {
            if (!this.db) return;
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.add({ vibeId, blob, timestamp: Date.now() });
                tx.oncomplete = () => {
                    console.log(`[Cache] Saved clip for ${vibeId}`);
                    resolve();
                };
                tx.onerror = () => resolve();
            });
        },

        async getClips(vibeId) {
            if (!this.db) return [];
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const index = store.index('vibeId');
                const request = index.getAll(vibeId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => resolve([]);
            });
        },

        async getClipCounts() {
            if (!this.db) return {};
            const counts = {};
            state.vibes.forEach(v => { counts[v.id] = 0; });
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.openCursor();
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const vibeId = cursor.value.vibeId;
                        counts[vibeId] = (counts[vibeId] || 0) + 1;
                        cursor.continue();
                    } else {
                        resolve(counts);
                    }
                };
                request.onerror = () => resolve(counts);
            });
        },

        async getRandomClip(vibeId) {
            const clips = await this.getClips(vibeId);
            if (clips.length === 0) return null;
            const clip = clips[Math.floor(Math.random() * clips.length)];
            return URL.createObjectURL(clip.blob);
        },

        async clearAll() {
            if (!this.db) return;
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.clear();
                tx.oncomplete = () => {
                    console.log('[Cache] All clips cleared');
                    resolve();
                };
                tx.onerror = () => resolve();
            });
        },

        async deleteByVibe(vibeId) {
            if (!this.db) return;
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const index = store.index('vibeId');
                const request = index.openCursor(vibeId);
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
                tx.oncomplete = () => {
                    console.log(`[Cache] Deleted all clips for ${vibeId}`);
                    resolve();
                };
                tx.onerror = () => resolve();
            });
        },

        async getTotalDuration(vibeId) {
            const clips = await this.getClips(vibeId);
            // MusicGen outputs 32kHz mono 16-bit WAV = 64000 bytes/sec
            let totalSeconds = 0;
            for (const clip of clips) {
                const dataBytes = clip.blob.size - 44; // subtract WAV header
                totalSeconds += Math.max(0, dataBytes / 64000);
            }
            return totalSeconds;
        }
    };

    // ======================== SMART BACKGROUND SCHEDULER ========================
    const scheduler = {
        isGenerating: false,
        currentVibeId: null,
        _stopped: false,

        start(vibeId) {
            this.currentVibeId = vibeId;
            this._stopped = false;
            if (!this.isGenerating) this._generateNext();
        },

        setCurrentVibe(vibeId) {
            this.currentVibeId = vibeId;
        },

        stop() {
            this._stopped = true;
        },

        async _generateNext() {
            if (this._stopped) { this.isGenerating = false; return; }
            this.isGenerating = true;

            try {
                const targetVibeId = await this._pickTarget();
                const vibe = state.vibes.find(v => v.id === targetVibeId);
                if (!vibe) { this.isGenerating = false; return; }

                console.log(`[Scheduler] Generating for: ${targetVibeId}`);
                if (targetVibeId === this.currentVibeId) {
                    setGenStatus('Generating next track in background...');
                }

                await generateAndCache(vibe);
            } catch (e) {
                console.warn('[Scheduler] Generation failed:', e.message);
                // Wait before retrying to avoid hammering a dead server
                await new Promise(r => setTimeout(r, 5000));
            }

            // Loop: generate next
            if (!this._stopped) {
                this._generateNext();
            } else {
                this.isGenerating = false;
            }
        },

        async _pickTarget() {
            const counts = await audioCache.getClipCounts();

            // Priority 1: If user is listening, always generate for that vibe
            if (state.isPlaying && this.currentVibeId) {
                console.log(`[Scheduler] Priority 1: active vibe ${this.currentVibeId} (${counts[this.currentVibeId] || 0} clips)`);
                return this.currentVibeId;
            }

            // Priority 2: No playback — fill the vibe with least clips
            const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]);
            console.log(`[Scheduler] Priority 2: least clips → ${sorted[0][0]} (${sorted[0][1]} clips)`);
            return sorted[0][0];
        }
    };

    // ======================== INIT ========================
    document.addEventListener('DOMContentLoaded', async () => {
        cacheDom();
        initVisualizer();
        initAudioEngine();
        bindEvents();

        // Initialize IndexedDB cache BEFORE rendering grid (so durations are available)
        await audioCache.init();

        // Render grid (with duration badges)
        renderVibeGrid();

        // Show clip counts in console
        const counts = await audioCache.getClipCounts();
        console.log('[Cache] Clip counts:', counts);
        setGenStatus('Ready');
    });

    // ======================== VIBE GRID RENDERING ========================
    function renderVibeGrid() {
        dom.vibeGrid.innerHTML = '';
        state.vibes.forEach((vibe, idx) => {
            const card = document.createElement('div');
            card.className = 'vibe-card' + (state.activeVibe && state.activeVibe.id === vibe.id ? ' active' : '');
            card.dataset.vibeId = vibe.id;
            card.style.animationDelay = `${idx * 0.05}s`;

            card.innerHTML = `
                ${vibe.isCustom ? '<div class="ai-badge">AI DESIGNED</div>' : ''}
                <button class="vibe-delete-btn" data-delete-vibe="${vibe.id}" title="Delete vibe">✕</button>
                <div class="vibe-glow" style="background: ${vibe.gradient}"></div>
                <div class="vibe-card-content">
                    <div class="vibe-icon" style="background: ${vibe.gradient}">
                        <span style="font-size: 22px; line-height: 1;">${vibe.icon}</span>
                    </div>
                    <h3>${vibe.name}</h3>
                    <p class="vibe-prompt-text">Prompt: ${vibe.prompt}</p>
                    <div class="vibe-duration" data-vibe-duration="${vibe.id}">🎵 ...</div>
                </div>
                ${state.activeVibe && state.activeVibe.id === vibe.id && state.isPlaying
                    ? '<div class="eq-bars"><span></span><span></span><span></span></div>'
                    : ''}
            `;

            // Click card to play (but not if clicking delete)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.vibe-delete-btn')) return;
                selectVibe(vibe);
            });

            // Delete button
            const deleteBtn = card.querySelector('.vibe-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteVibe(vibe.id);
            });

            dom.vibeGrid.appendChild(card);
        });

        // Update duration badges async
        updateDurationBadges();
    }

    async function updateDurationBadges() {
        for (const vibe of state.vibes) {
            const duration = await audioCache.getTotalDuration(vibe.id);
            const badge = document.querySelector(`[data-vibe-duration="${vibe.id}"]`);
            if (badge) {
                if (duration > 0) {
                    const mins = Math.floor(duration / 60);
                    const secs = Math.floor(duration % 60);
                    badge.textContent = `🎵 ${mins}:${secs.toString().padStart(2, '0')} cached`;
                } else {
                    badge.textContent = '🎵 No clips yet';
                }
            }
        }
    }

    // Update active state on cards WITHOUT re-rendering the entire grid
    function updateActiveCard() {
        const cards = dom.vibeGrid.querySelectorAll('.vibe-card');
        cards.forEach(card => {
            const vibeId = card.dataset.vibeId;
            const isActive = state.activeVibe && state.activeVibe.id === vibeId;

            // Toggle active class
            card.classList.toggle('active', isActive);

            // Toggle equalizer bars
            let eqBars = card.querySelector('.eq-bars');
            if (isActive && state.isPlaying) {
                if (!eqBars) {
                    eqBars = document.createElement('div');
                    eqBars.className = 'eq-bars';
                    eqBars.innerHTML = '<span></span><span></span><span></span>';
                    card.appendChild(eqBars);
                }
            } else if (eqBars) {
                eqBars.remove();
            }
        });
    }

    // ======================== SELECT VIBE ========================
    async function selectVibe(vibe) {
        // Stop current playback and clear queue
        if (audioEngine) {
            audioEngine.stop();
        }
        stopSimulatedProgress();

        state.activeVibe = vibe;
        state.isPlaying = true;
        state.progress = 0;
        state.trackCount = 0;

        dom.playerVibeName.textContent = vibe.name + ' Radio';
        updatePlayState(true);
        updateActiveCard();

        // Start visualizer
        visualizer.start();

        // Try cached clip first (instant playback)
        const cachedUrl = await audioCache.getRandomClip(vibe.id);
        if (cachedUrl) {
            audioEngine.enqueue(cachedUrl);
            audioEngine.play();
            visualizer.connectToHowler();
            setGenStatus('Playing from library');
        } else {
            // No cached clips — show generating status
            setGenStatus('Generating first clip...');
            startSimulatedProgress();
        }

        // Start/redirect background scheduler
        scheduler.setCurrentVibe(vibe.id);
        scheduler.start(vibe.id);
    }

    // ======================== PLAY / PAUSE ========================
    function togglePlay() {
        if (!state.activeVibe) {
            // Auto-select first vibe
            selectVibe(state.vibes[0]);
            return;
        }

        state.isPlaying = !state.isPlaying;
        updatePlayState(state.isPlaying);

        if (state.isPlaying) {
            visualizer.start();
            setGenStatus('Generating next track in background...');
            startSimulatedProgress();
            if (audioEngine) audioEngine.resume();
        } else {
            visualizer.stop();
            setGenStatus('Paused');
            stopSimulatedProgress();
            if (audioEngine) audioEngine.pause();
        }
        updateActiveCard();
    }

    function updatePlayState(playing) {
        // Swap play/pause icon
        dom.playIcon.innerHTML = playing
            ? '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'
            : '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>';

        // Status text
        dom.statusText.textContent = playing ? 'Live AI Generation' : 'Stream Paused';
        dom.statusCore.className = 'pulse-core' + (playing ? '' : ' inactive');

        if (playing) {
            dom.statusRing.style.animation = 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite';
        } else {
            dom.statusRing.style.animation = 'none';
        }
    }

    // ======================== SIMULATED PROGRESS ========================
    let progressTimer = null;

    function startSimulatedProgress() {
        stopSimulatedProgress();
        progressTimer = setInterval(() => {
            if (!state.isPlaying) return;
            state.progress += 1;
            if (state.progress >= 100) {
                state.progress = 0;
                state.trackCount++;
                setGenStatus('Crossfading to new track...');
                setTimeout(() => {
                    if (state.isPlaying) setGenStatus('Generating next track in background...');
                }, 2500);
            }
            dom.progressFill.style.width = state.progress + '%';
            dom.trackCounter.textContent = `Track ${state.trackCount + 1} of ∞`;

            // Simulated time
            const elapsed = Math.floor(state.progress * 0.3);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            dom.trackTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 300);
    }

    function stopSimulatedProgress() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    // ======================== GENERATION STATUS ========================
    function setGenStatus(text) {
        dom.genStatus.textContent = text;
    }

    // ======================== AUDIO ENGINE ========================
    function initAudioEngine() {
        audioEngine = new AuraAudioEngine({
            volume: parseInt(dom.volumeSlider.value) / 100,
            onTrackChange: (count) => {
                state.trackCount = count;
                dom.trackCounter.textContent = `Track ${count} of ∞`;
            },
            onProgress: (pct, seek, duration) => {
                state.progress = pct;
                dom.progressFill.style.width = pct + '%';
                const mins = Math.floor(seek / 60);
                const secs = Math.floor(seek % 60);
                dom.trackTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            },
            onStatusChange: (msg) => setGenStatus(msg),
            onNeedNextTrack: async () => {
                // Pre-load next clip from cache into queue for seamless crossfade
                if (!state.activeVibe) return;
                const clips = await audioCache.getClips(state.activeVibe.id);
                if (clips.length > 0) {
                    const clip = clips[Math.floor(Math.random() * clips.length)];
                    const blobUrl = URL.createObjectURL(clip.blob);
                    audioEngine.enqueue(blobUrl);
                }
            },
            onTrackEnd: async () => {
                // When queue is empty, refill from cache and restart playback
                if (state.activeVibe) {
                    const clips = await audioCache.getClips(state.activeVibe.id);
                    if (clips.length > 0) {
                        const clip = clips[Math.floor(Math.random() * clips.length)];
                        const blobUrl = URL.createObjectURL(clip.blob);
                        audioEngine.enqueue(blobUrl);

                        // Force play if engine stalled
                        if (!audioEngine._getCurrentTrack()?.playing()) {
                            audioEngine.play();
                            visualizer.connectToHowler();
                        }
                        setGenStatus('Playing from library');
                    } else {
                        setGenStatus('Waiting for next clip...');
                    }
                }
            }
        });
    }

    function initVisualizer() {
        visualizer = new AuraVisualizer('visualizer-canvas');
    }

    // ======================== BACKEND INTEGRATION ========================
    async function generateAndCache(vibe) {
        const fullPrompt = vibe.prompt + (state.weatherModifier ? ', ' + state.weatherModifier : '');

        const response = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                prompt: fullPrompt,
                vibe_name: vibe.name,
                duration: 30
            })
        });

        if (!response.ok) throw new Error(`API returned ${response.status}`);

        const data = await response.json();
        if (!data.audio_url) throw new Error('No audio_url in response');

        // Fetch audio as blob to bypass ngrok warning page
        const audioRes = await fetch(BACKEND_URL + data.audio_url, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);

        const blob = await audioRes.blob();

        // Save to persistent cache
        await audioCache.saveClip(vibe.id, blob);

        // If this is for the currently active vibe, enqueue for playback
        if (state.activeVibe && vibe.id === state.activeVibe.id) {
            const blobUrl = URL.createObjectURL(blob);
            audioEngine.enqueue(blobUrl);

            // If nothing was playing (first clip), start now
            if (!audioEngine.isPlaying || !audioEngine._getCurrentTrack()?.playing()) {
                stopSimulatedProgress();
                audioEngine.play();
                visualizer.connectToHowler();
            }
            setGenStatus('Playing AI-generated audio');
        }

        console.log(`[Backend] Generated & cached clip for ${vibe.id}`);

        // Update duration display on vibe cards
        updateDurationBadges();
    }


    // ======================== CUSTOM VIBE CREATION ========================
    async function handleGenerateCustomVibe() {
        const input = dom.customVibeInput.value.trim();
        if (!input) return;

        dom.generateVibeBtn.disabled = true;
        dom.generateLabel.textContent = 'Creating...';
        setGenStatus('Creating custom vibe...');

        try {
            let vibeData;

            if (GEMINI_API_KEY) {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `Create a background music vibe based on: "${input}".

Return:
- name: A catchy short name (2-3 words)
- icon: A single emoji that represents this vibe
- prompt: A detailed MusicGen prompt with tempo, instruments, mood. CRITICAL: The prompt MUST include "no vocals, no lyrics, no singing, instrumental only" to ensure purely instrumental output.
- gradient: A CSS gradient string like "linear-gradient(135deg, #hexcolor1, #hexcolor2)"` }] }],
                            systemInstruction: { parts: [{ text: 'You are an expert sound designer. Always ensure prompts produce instrumental-only music with NO vocals or lyrics.' }] },
                            generationConfig: {
                                responseMimeType: 'application/json',
                                responseSchema: {
                                    type: 'OBJECT',
                                    properties: {
                                        name: { type: 'STRING' },
                                        icon: { type: 'STRING' },
                                        prompt: { type: 'STRING' },
                                        gradient: { type: 'STRING' }
                                    }
                                }
                            }
                        })
                    }
                );

                const data = await res.json();
                vibeData = JSON.parse(data.candidates[0].content.parts[0].text);
            } else {
                // Demo mode fallback
                vibeData = {
                    name: input.split(' ').slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    icon: '✨',
                    prompt: `${input}, ambient, background music, no vocals, no lyrics, no singing, instrumental only`,
                    gradient: 'linear-gradient(135deg, #6366f1, #a855f7)'
                };
            }

            const newVibe = {
                id: 'custom-' + Date.now(),
                name: vibeData.name,
                icon: vibeData.icon || '✨',
                prompt: vibeData.prompt,
                gradient: vibeData.gradient || 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#a855f7',
                isCustom: true
            };

            state.vibes.push(newVibe);
            saveCustomVibes();
            dom.customVibeInput.value = '';
            dom.generateVibeBtn.disabled = true;
            renderVibeGrid();
            selectVibe(newVibe);
            setGenStatus(`"${newVibe.name}" created!`);

        } catch (err) {
            console.error('Custom vibe creation failed:', err);
            setGenStatus('Failed to create custom vibe');
        } finally {
            dom.generateVibeBtn.disabled = !dom.customVibeInput.value.trim();
            dom.generateLabel.textContent = 'Add Vibe';
        }
    }

    // ======================== DELETE VIBE ========================
    async function handleDeleteVibe(vibeId) {
        const vibe = state.vibes.find(v => v.id === vibeId);
        if (!vibe) return;
        if (!confirm(`Delete "${vibe.name}" and all its cached music?`)) return;

        // Stop if currently playing this vibe
        if (state.activeVibe && state.activeVibe.id === vibeId) {
            if (audioEngine) audioEngine.stop();
            scheduler.stop();
            state.activeVibe = null;
            state.isPlaying = false;
            updatePlayState(false);
            visualizer.stop();
            dom.playerVibeName.textContent = 'Select a Vibe';
        }

        // Delete clips from IndexedDB
        await audioCache.deleteByVibe(vibeId);

        // Remove from state
        state.vibes = state.vibes.filter(v => v.id !== vibeId);
        saveCustomVibes();

        // Re-render grid
        renderVibeGrid();
        setGenStatus(`"${vibe.name}" deleted`);
    }

    // ======================== GEMINI: SMART PA (TTS) ========================
    async function handleBroadcast() {
        const text = dom.announcementInput.value.trim();
        if (!text) return;

        dom.broadcastBtn.disabled = true;
        dom.broadcastLabel.textContent = 'Broadcasting...';
        dom.genStatus.className = 'gen-badge broadcasting';
        setGenStatus('✨ Broadcasting Store Announcement...');

        if (!GEMINI_API_KEY) {
            // Demo mode — show status only
            setTimeout(() => {
                dom.broadcastBtn.disabled = false;
                dom.broadcastLabel.textContent = 'Broadcast Announcement';
                dom.genStatus.className = 'gen-badge';
                dom.announcementInput.value = '';
                setGenStatus(state.isPlaying ? 'Generating next track in background...' : 'Paused');
            }, 2000);
            return;
        }

        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text }] }],
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } }
                        }
                    })
                }
            );

            const data = await res.json();
            const base64Audio = data.candidates[0].content.parts[0].inlineData.data;

            // Convert PCM16 to WAV
            const blob = pcmToWav(base64Audio, 24000);
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                dom.genStatus.className = 'gen-badge';
                setGenStatus(state.isPlaying ? 'Generating next track in background...' : 'Paused');
            };
            audio.play();
            dom.announcementInput.value = '';
        } catch (err) {
            console.error('TTS failed:', err);
            setGenStatus('Announcement failed');
        } finally {
            dom.broadcastBtn.disabled = false;
            dom.broadcastLabel.textContent = 'Broadcast Announcement';
            dom.genStatus.className = 'gen-badge';
        }
    }

    /** Convert base64 PCM16 to WAV blob (from original React code) */
    function pcmToWav(base64, sampleRate) {
        const bin = atob(base64);
        const pcm = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);

        const buf = new ArrayBuffer(44 + pcm.byteLength);
        const v = new DataView(buf);
        const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

        w(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true);
        w(8, 'WAVE'); w(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        w(36, 'data'); v.setUint32(40, pcm.byteLength, true);

        new Uint8Array(buf, 44).set(pcm);
        return new Blob([buf], { type: 'audio/wav' });
    }

    // ======================== EVENT BINDINGS ========================
    function bindEvents() {
        // Play / Pause
        dom.playBtn.addEventListener('click', togglePlay);

        // Skip
        dom.skipBtn.addEventListener('click', () => {
            if (audioEngine && audioEngine.isPlaying) {
                audioEngine.skip();
            } else {
                // Simulated skip
                state.progress = 0;
                state.trackCount++;
                dom.progressFill.style.width = '0%';
                dom.trackCounter.textContent = `Track ${state.trackCount + 1} of ∞`;
                setGenStatus('Crossfading to new track...');
                setTimeout(() => {
                    if (state.isPlaying) setGenStatus('Generating next track in background...');
                }, 2000);
            }
        });

        // Volume
        dom.volumeSlider.addEventListener('input', (e) => {
            const vol = parseInt(e.target.value) / 100;
            if (audioEngine) audioEngine.setVolume(vol);
        });

        // Custom vibe input
        dom.customVibeInput.addEventListener('input', () => {
            dom.generateVibeBtn.disabled = !dom.customVibeInput.value.trim();
        });
        dom.customVibeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleGenerateCustomVibe();
        });
        dom.generateVibeBtn.addEventListener('click', handleGenerateCustomVibe);

        // Announcement input
        dom.announcementInput.addEventListener('input', () => {
            dom.broadcastBtn.disabled = !dom.announcementInput.value.trim();
        });
        dom.broadcastBtn.addEventListener('click', handleBroadcast);



        // Clear audio cache
        dom.clearCacheBtn.addEventListener('click', async () => {
            if (!confirm('Clear all cached audio clips?')) return;
            scheduler.stop();
            if (audioEngine) audioEngine.stop();
            await audioCache.clearAll();
            dom.clearCacheLabel.textContent = 'Cache cleared!';
            setGenStatus('Cache cleared');
            setTimeout(() => {
                dom.clearCacheLabel.textContent = 'Clear Audio Cache';
            }, 2000);
        });


        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            if (e.code === 'KeyN') dom.skipBtn.click();
        });

    }

})();
