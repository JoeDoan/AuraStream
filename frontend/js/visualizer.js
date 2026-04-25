/* ============================================================
   AuraStream — Waveform / Frequency Visualizer
   Uses Web Audio API AnalyserNode for real audio,
   falls back to smooth simulated bars when idle.
   ============================================================ */

class AuraVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.animationId = null;
        this.isActive = false;
        this.barCount = 64;
        this.simBars = new Float32Array(this.barCount);

        // Web Audio API
        this.audioCtx = null;
        this.analyser = null;
        this.dataArray = null;

        // Smooth simulated bars
        for (let i = 0; i < this.barCount; i++) {
            this.simBars[i] = Math.random() * 0.3;
        }

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    /** Connect to a Howler sound for real frequency data */
    connectToHowler(sound) {
        try {
            if (!this.audioCtx) {
                this.audioCtx = Howler.ctx;
            }
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 128;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Connect Howler's master output to our analyser
            Howler.masterGain.connect(this.analyser);
        } catch (e) {
            console.warn('Could not connect analyser:', e);
        }
    }

    start() {
        this.isActive = true;
        if (!this.animationId) this._draw();
    }

    stop() {
        this.isActive = false;
    }

    destroy() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    _draw() {
        this.animationId = requestAnimationFrame(() => this._draw());

        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;
        this.ctx.clearRect(0, 0, w, h);

        const barWidth = w / this.barCount;
        const gap = 2;

        // Get real data or simulate
        let values;
        if (this.analyser && this.dataArray && this.isActive) {
            this.analyser.getByteFrequencyData(this.dataArray);
            values = this.dataArray;
        } else {
            values = null;
        }

        for (let i = 0; i < this.barCount; i++) {
            let barHeight;

            if (values && this.isActive) {
                // Real audio data (mapped 0-255 → 0-1)
                const idx = Math.floor(i * values.length / this.barCount);
                const target = values[idx] / 255;
                this.simBars[i] += (target - this.simBars[i]) * 0.3;
                barHeight = this.simBars[i] * h * 0.85;
            } else if (this.isActive) {
                // Simulated smooth wave
                const time = Date.now() / 1000;
                const target = (Math.sin(time * 2 + i * 0.3) * 0.3 + 0.35) *
                               (Math.sin(time * 0.7 + i * 0.15) * 0.2 + 0.5);
                this.simBars[i] += (target - this.simBars[i]) * 0.08;
                barHeight = this.simBars[i] * h * 0.8;
            } else {
                // Idle — tiny flat bars
                const target = 0.03;
                this.simBars[i] += (target - this.simBars[i]) * 0.05;
                barHeight = this.simBars[i] * h;
            }

            const x = i * barWidth + gap / 2;
            const bw = barWidth - gap;
            const y = (h - barHeight) / 2;

            // Gradient: indigo → purple
            const gradient = this.ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(1, '#a855f7');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.roundRect(x, y, bw, barHeight, 2);
            this.ctx.fill();
        }
    }
}

// Export to global
window.AuraVisualizer = AuraVisualizer;
