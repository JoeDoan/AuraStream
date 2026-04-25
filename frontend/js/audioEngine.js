/* ============================================================
   AuraStream — Audio Engine (Howler.js Crossfade Controller)
   Manages dual-track playback with seamless crossfading.
   ============================================================ */

class AuraAudioEngine {
    constructor(options = {}) {
        this.crossfadeDuration = options.crossfadeDuration || 4000; // ms
        this.volume = options.volume || 0.75;

        // Dual-track system
        this.trackA = null;
        this.trackB = null;
        this.activeTrack = 'A';

        // Queue & state
        this.queue = [];
        this.trackCount = 0;
        this.isPlaying = false;
        this.isCrossfading = false;
        this.progressInterval = null;

        // Callbacks
        this.onTrackChange = options.onTrackChange || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onStatusChange = options.onStatusChange || (() => {});
        this.onTrackEnd = options.onTrackEnd || (() => {});
        this.onNeedNextTrack = options.onNeedNextTrack || (() => {}); // Pre-load next track
    }

    /** Load audio URLs into the queue */
    loadQueue(urls) {
        this.queue = [...urls];
    }

    /** Add a single URL to the queue */
    enqueue(url) {
        this.queue.push(url);
        // Auto-play if engine was waiting for new tracks
        if (this.isPlaying) {
            const current = this._getCurrentTrack();
            const isIdle = !current || (!current.playing() && current.state() !== 'loading');
            if (isIdle) {
                this._playNext();
                this._startProgressTracking();
            }
        }
    }

    /** Start playback */
    play() {
        if (this.queue.length === 0) {
            this.onStatusChange('No audio in queue');
            return;
        }

        this.isPlaying = true;
        this._playNext();
        this._startProgressTracking();
    }

    /** Pause playback */
    pause() {
        this.isPlaying = false;
        const current = this._getCurrentTrack();
        if (current && current.playing()) {
            current.pause();
        }
        this._stopProgressTracking();
        this.onStatusChange('Paused');
    }

    /** Resume playback */
    resume() {
        this.isPlaying = true;
        const current = this._getCurrentTrack();
        if (current) {
            current.play();
        }
        this._startProgressTracking();
        this.onStatusChange('Playing');
    }

    /** Toggle play/pause */
    toggle() {
        if (this.isPlaying) this.pause();
        else if (this._getCurrentTrack()) this.resume();
        else this.play();
    }

    /** Skip to next track */
    skip() {
        this.onStatusChange('Skipping...');
        const current = this._getCurrentTrack();
        if (current) {
            current.fade(this.volume, 0, 500);
            setTimeout(() => {
                current.stop();
                current.unload();
                this._playNext();
            }, 500);
        } else {
            this._playNext();
        }
    }

    /** Set volume (0-1) */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        const current = this._getCurrentTrack();
        if (current) current.volume(this.volume);
    }

    /** Get current playback progress (0-100) */
    getProgress() {
        const track = this._getCurrentTrack();
        if (!track || !track.playing()) return 0;
        const seek = track.seek() || 0;
        const duration = track.duration() || 1;
        return (seek / duration) * 100;
    }

    /** Get current seek time in seconds */
    getSeekTime() {
        const track = this._getCurrentTrack();
        if (!track) return 0;
        return track.seek() || 0;
    }

    /** Get duration of current track */
    getDuration() {
        const track = this._getCurrentTrack();
        if (!track) return 0;
        return track.duration() || 0;
    }

    // --- Private Methods ---

    _getCurrentTrack() {
        return this.activeTrack === 'A' ? this.trackA : this.trackB;
    }

    _getNextTrackSlot() {
        return this.activeTrack === 'A' ? 'B' : 'A';
    }

    _playNext() {
        if (this.queue.length === 0) {
            this.onStatusChange('Queue empty — waiting for new tracks');
            this.onTrackEnd();
            return;
        }

        const url = this.queue.shift();
        this.trackCount++;
        const slot = this.activeTrack;

        this.onStatusChange('Loading track...');

        const sound = new Howl({
            src: [url],
            format: ['wav'],
            volume: 0,
            html5: false,
            onload: () => {
                if (!this.isPlaying) return;
                sound.volume(this.volume);
                sound.play();
                this.onStatusChange('Generating next track in background...');
                this.onTrackChange(this.trackCount);
            },
            onend: () => {
                sound.unload();
                if (this.isPlaying && !this.isCrossfading) {
                    this.activeTrack = this._getNextTrackSlot() === 'A' ? 'B' : 'A';
                    this._playNext();
                }
            },
            onplay: () => {
                // Pre-load next track from cache so crossfade has something ready
                if (this.queue.length === 0) {
                    this.onNeedNextTrack();
                }

                // Schedule crossfade near end
                const duration = sound.duration();
                if (duration > this.crossfadeDuration / 1000 + 2) {
                    const fadeTime = (duration - this.crossfadeDuration / 1000) * 1000;
                    setTimeout(() => {
                        if (this.isPlaying && this.queue.length > 0) {
                            this._crossfadeToNext(sound);
                        }
                    }, fadeTime);
                }
            },
            onloaderror: (id, err) => {
                console.error('Audio load error:', err);
                this.onStatusChange('Error loading audio');
                // Try next track
                setTimeout(() => this._playNext(), 1000);
            }
        });

        if (slot === 'A') this.trackA = sound;
        else this.trackB = sound;
    }

    _crossfadeToNext(outgoing) {
        if (this.isCrossfading || this.queue.length === 0) return;
        this.isCrossfading = true;
        this.onStatusChange('Crossfading to new track...');

        const nextSlot = this._getNextTrackSlot();
        const nextUrl = this.queue.shift();
        this.trackCount++;

        const incoming = new Howl({
            src: [nextUrl],
            format: ['wav'],
            volume: 0,
            html5: false,
            onload: () => {
                incoming.play();
                incoming.fade(0, this.volume, this.crossfadeDuration);
                outgoing.fade(this.volume, 0, this.crossfadeDuration);

                setTimeout(() => {
                    outgoing.stop();
                    outgoing.unload();
                    this.activeTrack = nextSlot;
                    this.isCrossfading = false;
                    this.onTrackChange(this.trackCount);
                    this.onStatusChange('Generating next track in background...');
                }, this.crossfadeDuration);
            },
            onplay: () => {
                // Pre-load next track for seamless transition
                if (this.queue.length === 0) {
                    this.onNeedNextTrack();
                }

                // Schedule next crossfade
                const duration = incoming.duration();
                if (duration > this.crossfadeDuration / 1000 + 2) {
                    const fadeTime = (duration - this.crossfadeDuration / 1000) * 1000;
                    setTimeout(() => {
                        if (this.isPlaying && this.queue.length > 0) {
                            this._crossfadeToNext(incoming);
                        }
                    }, fadeTime);
                }
            },
            onend: () => {
                incoming.unload();
                if (this.isPlaying && !this.isCrossfading) {
                    this.activeTrack = this._getNextTrackSlot() === 'A' ? 'B' : 'A';
                    this._playNext();
                }
            },
            onloaderror: (id, err) => {
                console.error('Crossfade audio load error:', err);
                this.isCrossfading = false;
                setTimeout(() => this._playNext(), 1000);
            }
        });

        if (nextSlot === 'A') this.trackA = incoming;
        else this.trackB = incoming;
    }

    _startProgressTracking() {
        this._stopProgressTracking();
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                this.onProgress(this.getProgress(), this.getSeekTime(), this.getDuration());
            }
        }, 250);
    }

    _stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    /** Stop playback completely and clear queue */
    stop() {
        this.isPlaying = false;
        this._stopProgressTracking();
        if (this.trackA) { this.trackA.stop(); this.trackA.unload(); this.trackA = null; }
        if (this.trackB) { this.trackB.stop(); this.trackB.unload(); this.trackB = null; }
        this.activeTrack = 'A';
        this.queue = [];
        this.trackCount = 0;
        this.isCrossfading = false;
    }

    /** Clean up */
    destroy() {
        this.stop();
    }
}

// Export to global
window.AuraAudioEngine = AuraAudioEngine;
