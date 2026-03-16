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
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0;
        this.gainNode.connect(this.analyser);
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

        this.stopTone();

        this.osc1 = this.audioCtx.createOscillator();
        this.osc2 = this.audioCtx.createOscillator();

        this.osc1.type = 'sine';
        this.osc2.type = 'sine';

        this.osc1.frequency.setValueAtTime(freqs[0], this.audioCtx.currentTime);
        this.osc2.frequency.setValueAtTime(freqs[1], this.audioCtx.currentTime);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);

        this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0.1, this.audioCtx.currentTime + 0.01);

        this.osc1.start();
        this.osc2.start();

        updateFrequencyDisplay(freqs[0], freqs[1]);

        if (duration) {
            setTimeout(() => this.stopTone(), duration);
        }
    }

    stopTone() {
        if (!this.initialized) return;
        
        this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.05);
        
        setTimeout(() => {
            if (this.osc1) { this.osc1.stop(); this.osc1.disconnect(); }
            if (this.osc2) { this.osc2.stop(); this.osc2.disconnect(); }
            this.osc1 = null;
            this.osc2 = null;
            updateFrequencyDisplay(null, null);
        }, 50);
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
