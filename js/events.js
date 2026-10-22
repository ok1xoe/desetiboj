// Logika deseti disciplín (bez DOM) - sdílí ji hra i testy v Node.
// Vstup do kroku (50 Hz): pole symbolů 'L' / 'R' (střídavé mačkání) a 'A' (akce).
(function (root) {
    'use strict';

    var DEC = root.DEC = root.DEC || {};

    var ST = 50;              // kroků za sekundu
    var VMAX = 10.8;          // nejvyšší rychlost běžce (m/s)
    var GAIN = 0.62;          // přírůstek rychlosti na jeden platný stisk
    var K = 0.5;              // útlum rychlosti za sekundu
    var JT = 22;              // délka skoku přes překážku (kroky)
    var ANG_STEP = 90 / 40;   // rychlost ukazatele úhlu (stupně za krok)

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function eff(a, opt, w) { var d = (a - opt) / w; return Math.max(0, 1 - d * d); }
    function pwr(x, c) { return Math.pow(x, c); }

    // zjednodušená bodovací tabulka (vzorce desetiboje), body = A * (B - T)^C resp. A * (D - B)^C
    function trackPts(A, B, C) { return function (t) { return (!(t > 0) || t >= B) ? 0 : Math.floor(A * pwr(B - t, C)); }; }
    function fieldPts(A, B, C) { return function (d) { return (!(d > B)) ? 0 : Math.floor(A * pwr(d - B, C)); }; }

    function c2(n) { return (n < 10 ? '0' : '') + n; }
    function fmtTime(t) {
        t = Math.max(0, t || 0);
        var m = Math.floor(t / 60), s = t - m * 60;
        var sec = (Math.round(s * 100) / 100);
        if (sec >= 60) { sec = 59.99; }
        var st = sec.toFixed(2).replace('.', ',');
        if (m > 0) { return m + ':' + (sec < 10 ? '0' : '') + st + ' S'; }
        return st + ' S';
    }
    function fmtCm(v) { return (Math.round(v) / 100).toFixed(2).replace('.', ',') + ' M'; }
    function fmtM(v) { return (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' M'; }

    DEC.fmtTime = fmtTime;

    var EVENTS = [
        { id: '100', name: '100 M', short: '100', day: 1, kind: 'race', len: 100, vmul: 1, tmul: 1, qual: 17, score: trackPts(25.4347, 18, 1.81), fmt: fmtTime,
          help: ['STŘÍDAVĚ MAČKEJ ŠIPKY VLEVO/VPRAVO.', 'ČÍM RYCHLEJI, TÍM VĚTŠÍ RYCHLOST.', 'KVALIFIKACE: 17,00 S'] },
        { id: 'lj', name: 'SKOK DALEKÝ', short: 'DÁL', day: 1, kind: 'field', runway: true, len: 30, vmul: 1, score: fieldPts(0.14354, 220, 1.4), fmt: fmtCm,
          help: ['ROZBĚHNI SE MAČKÁNÍM ŠIPEK.', 'MEZERNÍK U PRKNA = ODRAZ (NE ZA NÍM!)', 'PAK MEZERNÍKEM ZASTAV ÚHEL (IDEÁL 28).'] },
        { id: 'sp', name: 'VRH KOULÍ', short: 'KOU', day: 1, kind: 'field', runway: false, score: fieldPts(51.39, 1.5, 1.05), fmt: fmtM,
          help: ['MAČKEJ ŠIPKY = ROZTOČENÍ (SÍLA).', 'MEZERNÍK = ZAMKNI SÍLU, PAK ÚHEL.', 'IDEÁLNÍ ÚHEL OKOLO 40 STUPŇŮ.'] },
        { id: 'hj', name: 'SKOK VYSOKÝ', short: 'VÝŠ', day: 1, kind: 'bar', runway: true, len: 16, vmul: 1, step: 4, minBar: 140, maxBar: 240, startBar: 170,
          score: fieldPts(0.8465, 75, 1.42), fmt: fmtCm,
          help: ['ROZBĚH NEPŘEHÁNĚJ (IDEÁL ~7 M/S).', 'MEZERNÍK TĚSNĚ PŘED LATÍ = ODRAZ,', 'PAK ÚHEL (IDEÁL 68). 3 POKUSY NA VÝŠKU.'] },
        { id: '400', name: '400 M', short: '400', day: 1, kind: 'race', len: 400, vmul: 1.7, tmul: 2.1, qual: 75, stam: true, drain: 0.005, rec: 0.03,
          score: trackPts(1.53775, 82, 1.81), fmt: fmtTime,
          help: ['DLOUHÝ BĚH - HLÍDEJ VÝDRŽ.', 'KDYŽ PŘEPÁLÍŠ START, ZPOMALÍŠ.', 'KVALIFIKACE: 1:15,00 S'] },
        { id: '110', name: '110 M PŘEKÁŽEK', short: 'PŘE', day: 2, kind: 'race', hurdles: true, len: 110, vmul: 1, tmul: 1.18, qual: 26, score: trackPts(5.74352, 28.5, 1.92), fmt: fmtTime,
          help: ['BĚŽ A PŘESKAKUJ PŘEKÁŽKY MEZERNÍKEM.', 'SKOK ZAČNI 1-3 M PŘED PŘEKÁŽKOU.', 'SRAŽENÁ PŘEKÁŽKA TĚ ZPOMALÍ.'] },
        { id: 'dt', name: 'HOD DISKEM', short: 'DIS', day: 2, kind: 'field', runway: false, score: fieldPts(12.91, 4, 1.1), fmt: fmtM,
          help: ['MAČKEJ ŠIPKY = ROZTOČENÍ (SÍLA).', 'MEZERNÍK = ZAMKNI SÍLU, PAK ÚHEL.', 'IDEÁLNÍ ÚHEL OKOLO 37 STUPŇŮ.'] },
        { id: 'pv', name: 'SKOK O TYČI', short: 'TYČ', day: 2, kind: 'bar', runway: true, len: 30, vmul: 1, step: 10, minBar: 250, maxBar: 560, startBar: 380,
          score: fieldPts(0.2797, 100, 1.35), fmt: fmtCm,
          help: ['ROZBĚHNI SE NA PLNOU RYCHLOST.', 'MEZERNÍK ~1,5 M PŘED LATÍ = ZAPICHNI TYČ', 'PAK ÚHEL ODRAZU (IDEÁL OKOLO 72).'] },
        { id: 'jv', name: 'HOD OŠTĚPEM', short: 'OŠT', day: 2, kind: 'field', runway: true, len: 26, vmul: 1, score: fieldPts(10.14, 7, 1.08), fmt: fmtM,
          help: ['ROZBĚH, MEZERNÍK = HOD (PŘED ČÁROU!)', 'PAK MEZERNÍKEM ZASTAV ÚHEL (IDEÁL 35).', 'ČÍM VĚTŠÍ ROZBĚH, TÍM DÁL.'] },
        { id: '1500', name: '1500 M', short: '1500', day: 2, kind: 'race', len: 1500, vmul: 4, tmul: 6.2, qual: 400, stam: true, drain: 0.005, rec: 0.03,
          score: trackPts(0.03768, 480, 1.85), fmt: fmtTime,
          help: ['NEJDELŠÍ BĚH - ROZLOŽ SI SÍLY!', 'DRŽ STÁLÉ, NE PŘÍLIŠ VYSOKÉ TEMPO.', 'KVALIFIKACE: 6:40,00 S'] }
    ];
    // maximální vzdálenost pro vykreslení letu předmětu (m) a délka letu v krocích
    var DMAX = { sp: 20, dt: 60, jv: 100 };

    DEC.EVENTS = EVENTS;
    DEC.CONST = { ST: ST, VMAX: VMAX, JT: JT, DMAX: DMAX };

    function newAttempt(def, opts) {
        var a = {
            def: def, phase: 'ready', t: 0, clock: 0, pos: 0, v: 0, scroll: 0, last: '', stam: 1,
            power: 0, ang: 0, angDir: 1, angT: 0, jumpT: -1, hurdles: null, hit: 0,
            res: null, bar: (opts && opts.bar) || 0, take: null, fl: null, flT: 0, flLen: 60, ev: []
        };
        if (def.hurdles) {
            a.hurdles = [];
            for (var i = 0; i < 10; i++) { a.hurdles.push({ x: 13.72 + 9.14 * i, down: false, done: false }); }
        }
        return a;
    }

    function tapValid(a, s) {
        if (s !== 'L' && s !== 'R') { return false; }
        if (a.last === s) { return false; }
        a.last = s;
        return true;
    }

    function fail(a, msg) { a.res = { valid: false, value: 0, msg: msg }; a.phase = 'done'; a.ev.push('foul'); }

    function stepRace(a, inp) {
        var d = a.def, i, s;
        for (i = 0; i < inp.length; i++) {
            s = inp[i];
            if (s === 'A') {
                if (d.hurdles && a.phase === 'run' && a.jumpT < 0) { a.jumpT = 0; a.ev.push('jump'); }
            } else if (tapValid(a, s)) {
                if (a.phase === 'ready') { a.phase = 'run'; }
                var m = d.stam ? 0.4 + 0.6 * clamp(a.stam / 0.8, 0, 1) : 1;
                a.v = Math.min(VMAX, a.v + GAIN * m);
                if (d.stam) { a.stam = Math.max(0, a.stam - d.drain); }
                a.ev.push('tap');
            }
        }
        if (a.phase !== 'run') { return; }
        a.clock++;
        a.v -= a.v * K / ST;
        if (d.stam) { a.stam = Math.min(1, a.stam + d.rec / ST); }
        var prev = a.pos;
        a.pos += a.v * d.vmul / ST;
        a.scroll += a.v * 8 / ST;
        if (a.jumpT >= 0) { a.jumpT++; if (a.jumpT >= JT) { a.jumpT = -1; } }
        if (a.hurdles) {
            for (i = 0; i < a.hurdles.length; i++) {
                var h = a.hurdles[i];
                if (!h.done && prev < h.x && a.pos >= h.x) {
                    h.done = true;
                    if (a.jumpT >= 4 && a.jumpT <= JT - 4) { a.ev.push('clear'); }
                    else { h.down = true; a.v *= 0.55; a.hit++; a.ev.push('hit'); }
                }
            }
        }
        if (a.pos >= d.len) {
            var t = a.clock / ST * d.tmul;
            a.phase = 'done';
            a.res = { valid: t <= d.qual, value: t, msg: t <= d.qual ? '' : 'NEKVALIFIKOVÁN - PŘÍLIŠ POMALU' };
            a.ev.push(a.res.valid ? 'good' : 'foul');
        } else if (a.clock > ST * 150) {
            fail(a, 'VYPRŠEL ČAS');
        }
    }

    function lockAngle(a) {
        a.ang = clamp(a.ang, 0, 90);
        a.ev.push('throw');
        resolve(a);
        if (a.phase === 'done') { return; }
        a.phase = 'flight';
        a.flT = 0;
    }

    function bad(a, msg) { a.res = { valid: false, value: 0, msg: msg }; a.fl = { dist: 0, kind: 'bad' }; }

    function resolve(a) {
        var d = a.def, t = a.take, ang = a.ang, r, D;
        a.flLen = 60;
        switch (d.id) {
            case 'lj':
                if (ang < 8 || ang > 65) { bad(a, ang < 8 ? 'NEPLATNÝ - ÚHEL PŘÍLIŠ NÍZKÝ' : 'NEPLATNÝ - ÚHEL PŘÍLIŠ VYSOKÝ'); break; }
                D = 0.07 * t.v * t.v * eff(ang, 28, 45) - Math.max(0, d.len - t.pos);
                D = Math.max(0.5, D);
                a.res = { valid: true, value: Math.round(D * 100), msg: '' };
                a.fl = { dist: D, kind: 'lj' };
                a.flLen = 50;
                break;
            case 'sp': case 'dt': case 'jv':
                if (ang < 8 || ang > 80) { bad(a, ang < 8 ? 'NEPLATNÝ - ÚHEL PŘÍLIŠ NÍZKÝ' : 'NEPLATNÝ - ÚHEL PŘÍLIŠ VYSOKÝ'); break; }
                if (d.id === 'sp') { D = 1.5 + 17 * t.p * t.p * eff(ang, 40, 40); }
                else if (d.id === 'dt') { D = 4 + 52 * t.p * t.p * eff(ang, 37, 40); }
                else { var q = t.v / VMAX; D = 7 + 75 * q * q * eff(ang, 35, 40); }
                D = Math.round(D * 100) / 100;
                a.res = { valid: true, value: D, msg: '' };
                a.fl = { dist: D, kind: d.id };
                a.flLen = 70;
                break;
            case 'hj': case 'pv': {
                var pv = d.id === 'pv';
                var dist = d.len - t.pos;
                var tq = Math.max(0, 1 - Math.abs(dist - (pv ? 1.6 : 1.2)) / (pv ? 1.8 : 1.6));
                var sq = Math.max(0, 1 - Math.abs(t.v - (pv ? 10 : 7.5)) / (pv ? 6 : 5.5));
                var aq = eff(ang, pv ? 72 : 68, pv ? 38 : 40);
                if (tq < 0.05) { bad(a, dist > 1 ? 'ODRAZ PŘÍLIŠ DALEKO OD LATĚ' : 'ODRAZ PŘÍLIŠ BLÍZKO'); break; }
                var Q = 0.4 * tq + 0.25 * sq + 0.35 * aq;
                var H = pv ? 240 + 290 * Q : 125 + 95 * Q;
                var ok = H >= a.bar;
                a.res = { valid: ok, value: ok ? a.bar : 0, msg: ok ? '' : 'LAŤ SHOZENA' };
                a.fl = { dist: dist, kind: d.id, H: H, ok: ok };
                a.flLen = 60;
                break;
            }
            default: bad(a, '?');
        }
        if (!a.res.valid) { a.phase = 'flight'; a.flT = 0; a.flLen = 40; }
    }

    function stepField(a, inp) {
        var d = a.def, i, s;
        if (a.phase === 'ready' || a.phase === 'run') {
            for (i = 0; i < inp.length; i++) {
                s = inp[i];
                if (s === 'A') {
                    if (a.phase === 'run') {
                        a.take = { v: a.v, pos: a.pos, p: a.power };
                        a.phase = 'angle'; a.ang = 0; a.angDir = 1; a.angT = 0;
                        a.ev.push('jump');
                        break;
                    }
                } else if (tapValid(a, s)) {
                    if (a.phase === 'ready') { a.phase = 'run'; }
                    if (d.runway) { a.v = Math.min(VMAX, a.v + GAIN); }
                    else { a.power = Math.min(1, a.power + 0.045); }
                    a.ev.push('tap');
                }
            }
            if (a.phase === 'run') {
                a.clock++;
                if (d.runway) {
                    a.v -= a.v * K / ST;
                    a.pos += a.v * d.vmul / ST;
                    a.scroll += a.v * 8 / ST;
                    if (a.pos > d.len + 0.01) {
                        fail(a, d.kind === 'bar' ? 'NABĚHL JSI DO LATĚ' : 'ZÁSTUP - PŘEŠLAPAL JSI');
                        return;
                    }
                } else {
                    a.power -= a.power * 0.4 / ST;
                    if (a.clock > ST * 8) {          // vypršel čas na roztočení - automaticky zamkne
                        a.take = { v: 0, pos: 0, p: a.power };
                        a.phase = 'angle'; a.ang = 0; a.angDir = 1; a.angT = 0;
                    }
                }
            }
        }
        if (a.phase === 'angle') {
            var locked = false;
            for (i = 0; i < inp.length; i++) { if (inp[i] === 'A' && a.angT > 3) { locked = true; } }
            a.angT++;
            if (!locked) {
                a.ang += a.angDir * ANG_STEP;
                if (a.ang >= 90) { a.ang = 90; a.angDir = -1; }
                if (a.ang <= 0) { a.ang = 0; a.angDir = 1; }
                if (a.angT > ST * 4) { locked = true; }
            }
            if (locked) { lockAngle(a); }
            return;
        }
        if (a.phase === 'flight') {
            a.flT++;
            if (a.flT >= a.flLen) {
                a.phase = 'done';
                a.ev.push(a.res.valid ? 'good' : 'foul');
                a.ev.push('thud');
            }
        }
    }

    function step(a, inp) {
        a.t++;
        a.ev = [];
        if (a.phase === 'done') { return a; }
        if (a.def.kind === 'race') { stepRace(a, inp || []); } else { stepField(a, inp || []); }
        return a;
    }

    // body za výkon (celé číslo)
    function points(def, value) {
        if (value === null || value === undefined || !isFinite(value)) { return 0; }
        var p = def.score(value);
        return isFinite(p) && p > 0 ? p : 0;
    }

    DEC.newAttempt = newAttempt;
    DEC.step = step;
    DEC.points = points;
})(typeof window !== 'undefined' ? window : globalThis);
