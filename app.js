const DTMF_MAP = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633]
};

class DTMFSymbol {
    constructor() {
        this.audioCtx = null;
        this.osc1 = null;
        this.osc2 = null;
        this.gainNode = null;
        this.analyser = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;

        // Simulate telephone bandpass characteristics (approx 300Hz - 3400Hz)
        this.filter = this.audioCtx.createBiquadFilter();
        this.filter.type = 'bandpass';
        this.filter.frequency.value = 1850; // Midpoint
        this.filter.Q.value = 0.5; // Wide enough for DTMF range

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0;

        // Signal Chain: Oscillators -> Gain -> Filter -> Analyser -> Output
        this.gainNode.connect(this.filter);
        this.filter.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        
        this.initialized = true;
    }

    playTone(key, duration = null) {
        this.init();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const freqs = DTMF_MAP[key];
        if (!freqs) return;

        // If a tone is already playing, stop it immediately without long ramp
        if (this.osc1 || this.osc2) {
            this.stopTone(true);
        }

        this.osc1 = this.audioCtx.createOscillator();
        this.osc2 = this.audioCtx.createOscillator();

        this.osc1.type = 'sine';
        this.osc2.type = 'sine';

        const now = this.audioCtx.currentTime;

        this.osc1.frequency.setValueAtTime(freqs[0], now);
        this.osc2.frequency.setValueAtTime(freqs[1], now);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);

        // Smooth Attack to prevent clicking
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.02);

        this.osc1.start();
        this.osc2.start();

        updateFrequencyDisplay(freqs[0], freqs[1]);

        if (duration) {
            setTimeout(() => this.stopTone(), duration);
        }
    }

    stopTone(immediate = false) {
        if (!this.initialized || (!this.osc1 && !this.osc2)) return;
        
        const now = this.audioCtx.currentTime;
        const rampTime = immediate ? 0.005 : 0.05;
        
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + rampTime);
        
        const o1 = this.osc1;
        const o2 = this.osc2;
        this.osc1 = null;
        this.osc2 = null;

        setTimeout(() => {
            if (o1) { try { o1.stop(); o1.disconnect(); } catch(e) {} }
            if (o2) { try { o2.stop(); o2.disconnect(); } catch(e) {} }
            if (!this.osc1) updateFrequencyDisplay(null, null);
        }, rampTime * 1000 + 10);
    }
}

const simulator = new DTMFSymbol();

// UI Elements
const dtmfInput = document.getElementById('dtmfInput');
const playBtn = document.getElementById('playBtn');
const clearBtn = document.getElementById('clearBtn');
const lowFreqSpan = document.getElementById('lowFreq');
const highFreqSpan = document.getElementById('highFreq');
const waveformCanvas = document.getElementById('waveformCanvas');
const spectrumCanvas = document.getElementById('spectrumCanvas');

function updateFrequencyDisplay(low, high) {
    lowFreqSpan.textContent = low ? `${low} Hz` : '--- Hz';
    highFreqSpan.textContent = high ? `${high} Hz` : '--- Hz';
}

// Visualizer Logic
function drawVisualizers() {
    if (!simulator.initialized) {
        requestAnimationFrame(drawVisualizers);
        return;
    }

    const wCtx = waveformCanvas.getContext('2d');
    const sCtx = spectrumCanvas.getContext('2d');
    const bufferLength = simulator.analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    function animate() {
        requestAnimationFrame(animate);
        
        simulator.analyser.getByteTimeDomainData(timeData);
        simulator.analyser.getByteFrequencyData(freqData);

        // Waveform
        wCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        wCtx.lineWidth = 2;
        wCtx.strokeStyle = '#00f2ff';
        wCtx.beginPath();
        const sliceWidth = waveformCanvas.width * 1.0 / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = v * waveformCanvas.height / 2;
            if (i === 0) wCtx.moveTo(x, y);
            else wCtx.lineTo(x, y);
            x += sliceWidth;
        }
        wCtx.stroke();

        // Spectrum
        sCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
        const barWidth = (spectrumCanvas.width / bufferLength) * 2.5;
        let barX = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = freqData[i] / 2;
            sCtx.fillStyle = `rgb(255, 0, 122, ${freqData[i]/255})`;
            sCtx.fillRect(barX, spectrumCanvas.height - barHeight, barWidth, barHeight);
            barX += barWidth + 1;
        }
    }
    animate();
}

// Initialize Canvases
function resizeCanvases() {
    waveformCanvas.width = waveformCanvas.clientWidth * window.devicePixelRatio;
    waveformCanvas.height = waveformCanvas.clientHeight * window.devicePixelRatio;
    spectrumCanvas.width = spectrumCanvas.clientWidth * window.devicePixelRatio;
    spectrumCanvas.height = spectrumCanvas.clientHeight * window.devicePixelRatio;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();
drawVisualizers();

// Event Listeners
document.querySelectorAll('.key').forEach(keyBtn => {
    const startEvent = 'ontouchstart' in window ? 'touchstart' : 'mousedown';
    const endEvent = 'ontouchend' in window ? 'touchend' : 'mouseup';

    keyBtn.addEventListener(startEvent, (e) => {
        e.preventDefault();
        const key = keyBtn.getAttribute('data-key');
        simulator.playTone(key);
        dtmfInput.value += key;
    });

    keyBtn.addEventListener(endEvent, (e) => {
        simulator.stopTone();
    });

    keyBtn.addEventListener('mouseleave', () => {
        simulator.stopTone();
    });
});

playBtn.addEventListener('click', async () => {
    const sequence = dtmfInput.value.toUpperCase().split('');
    if (sequence.length === 0) return;

    playBtn.disabled = true;
    for (const key of sequence) {
        if (DTMF_MAP[key]) {
            simulator.playTone(key);
            await new Promise(r => setTimeout(r, 200)); // Tone duration
            simulator.stopTone();
            await new Promise(r => setTimeout(r, 100)); // Gap
        }
    }
    playBtn.disabled = false;
});

clearBtn.addEventListener('click', () => {
    dtmfInput.value = '';
});

// Keyboard Support
document.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();
    if (DTMF_MAP[key] && !e.repeat) {
        // Trigger visual effect on key
        const keyEl = document.querySelector(`.key[data-key="${key}"]`);
        if (keyEl) keyEl.classList.add('active');
        
        simulator.playTone(key);
        dtmfInput.value += key;
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toUpperCase();
    if (DTMF_MAP[key]) {
        const keyEl = document.querySelector(`.key[data-key="${key}"]`);
        if (keyEl) keyEl.classList.remove('active');
        simulator.stopTone();
    }
});
