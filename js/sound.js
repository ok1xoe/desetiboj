// Zvuky přes WebAudio – "beeper" (čtvercová vlna), vlastní melodie na titulní obrazovce.
(function (root) {
    'use strict';

    var DEC = root.DEC = root.DEC || {};

    var ac = null, muted = false, tuneTimer = null, tuneStep = 0, lastTap = 0;

    try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) { ac = new AC(); }
    } catch (e) { ac = null; }

    function unlock() {
        if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignorovat */ } }
    }

    function beep(freq, dur, slideTo, vol, delay) {
        if (!ac || muted) { return; }
        try {
            var t0 = ac.currentTime + (delay || 0);
            var o = ac.createOscillator(), g = ac.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur); }
            g.gain.setValueAtTime(vol || 0.04, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(g); g.connect(ac.destination);
            o.start(t0); o.stop(t0 + dur + 0.02);
        } catch (e) { /* ignorovat */ }
    }

    var TUNE = [
        392, 0, 392, 523, 0, 392, 523, 659, 784, 0, 659, 0, 523, 0, 0, 0,
        440, 0, 440, 587, 0, 440, 587, 698, 880, 0, 698, 0, 587, 0, 0, 0
    ];
    var BASS = [131, 0, 0, 0, 131, 0, 0, 0, 131, 0, 0, 0, 131, 0, 0, 0, 147, 0, 0, 0, 147, 0, 0, 0, 147, 0, 0, 0, 147, 0, 0, 0];

    DEC.sound = {
        unlock: unlock,
        toggleMute: function () { muted = !muted; if (muted) { DEC.sound.stopTune(); } return muted; },
        isMuted: function () { return muted; },
        tap: function (v) {
            var now = Date.now();
            if (now - lastTap < 40) { return; }
            lastTap = now;
            beep(180 + Math.min(12, Math.max(0, v || 0)) * 30, 0.03, 0, 0.02);
        },
        gun: function () { beep(1500, 0.06, 0, 0.06); beep(1500, 0.18, 0, 0.06, 0.5); },
        jump: function () { beep(220, 0.18, 660, 0.035); },
        angle: function () { beep(1000, 0.05, 0, 0.04); },
        throwIt: function () { beep(700, 0.35, 180, 0.04); },
        thud: function () { beep(110, 0.12, 60, 0.06); },
        hit: function () { beep(140, 0.15, 50, 0.06); },
        good: function () { [523, 659, 784].forEach(function (f, i) { beep(f, 0.1, 0, 0.045, i * 0.09); }); },
        foul: function () { beep(200, 0.25, 0, 0.05); beep(150, 0.3, 0, 0.05, 0.25); },
        die: function () { beep(660, 0.7, 50, 0.05); },
        over: function () { [392, 330, 262, 196].forEach(function (f, i) { beep(f, 0.25, 0, 0.05, i * 0.22); }); },
        win: function () { [523, 659, 784, 659, 784, 1047, 1047].forEach(function (f, i) { beep(f, 0.14, 0, 0.05, i * 0.13); }); },
        startTune: function () {
            if (tuneTimer || !ac) { return; }
            tuneTimer = setInterval(function () {
                var n = TUNE[tuneStep % TUNE.length], b = BASS[tuneStep % BASS.length];
                if (n) { beep(n, 0.12, 0, 0.03); }
                if (b) { beep(b, 0.3, 0, 0.03); }
                tuneStep++;
            }, 140);
        },
        stopTune: function () { if (tuneTimer) { clearInterval(tuneTimer); tuneTimer = null; } tuneStep = 0; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
