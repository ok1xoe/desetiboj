// Headless test hry v Node: atrapa DOM, simulace snímků (50 Hz), bot, kontrola NaN, přechody stavů,
// vykreslení framebufferu do PNG (argument: výstupní složka pro snímky).
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var root = path.join(__dirname, '..');
var outDir = process.argv[2] || null;
if (outDir) { fs.mkdirSync(outDir, { recursive: true }); }

var lastFrame = null;
var ctxStub = {
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function (img) { lastFrame = img.data; }
};
var listeners = {};
global.window = globalThis;
global.innerWidth = 1024; global.innerHeight = 768;
global.matchMedia = function () { return { matches: false }; };
global.addEventListener = function () { };
var storage = {};
global.localStorage = { getItem: function (k) { return storage[k] === undefined ? null : storage[k]; }, setItem: function (k, v) { storage[k] = String(v); } };
global.requestAnimationFrame = function () { };
global.document = {
    getElementById: function () { return { getContext: function () { return ctxStub; }, addEventListener: function () { }, style: {} }; },
    querySelectorAll: function () { return []; },
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    body: { style: {} }, hidden: false
};
['gfx', 'font', 'events', 'sprites', 'sound', 'main'].forEach(function (f) {
    vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
});

var DEC = global.DEC, G = DEC.game, EV = DEC.EVENTS;
var fails = 0;
function check(c, msg) { if (!c) { console.log('  CHYBA: ' + msg); fails++; } }

// ---------- PNG ----------
var crcT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; } return t; })();
function crc32(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) { c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); } return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    var td = Buffer.concat([Buffer.from(type), data]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function writePng(name, scale) {
    if (!outDir || !lastFrame) { return; }
    var W = 256, H = 192, s = scale || 3, w = W * s, h = H * s;
    var raw = Buffer.alloc((w * 3 + 1) * h);
    for (var y = 0; y < h; y++) {
        raw[y * (w * 3 + 1)] = 0;
        for (var x = 0; x < w; x++) {
            var o = ((Math.floor(y / s)) * W + Math.floor(x / s)) * 4, p = y * (w * 3 + 1) + 1 + x * 3;
            raw[p] = lastFrame[o]; raw[p + 1] = lastFrame[o + 1]; raw[p + 2] = lastFrame[o + 2];
        }
    }
    var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
function snap(name) { G._draw(); writePng(name); }

// ---------- sprity ----------
Object.keys(DEC.SPR).forEach(function (k) {
    var rows = DEC.SPR[k], w = rows[0].length;
    check(rows.every(function (r) { return r.length === w; }), 'sprite ' + k + ' má nestejné řádky');
    check(k === 'fall' ? rows.length === 6 && w === 14 : rows.length === 16 && w === 10, 'sprite ' + k + ' rozměr ' + w + 'x' + rows.length);
});

EV.forEach(function (d) {
    d.help.forEach(function (h) { check(h.length <= 42, 'nápověda příliš dlouhá (' + h.length + '): ' + h); });
    check(d.name.length * 12 <= 256, 'název příliš dlouhý: ' + d.name);
});
// znaky mimo font
(function () {
    var src = fs.readFileSync(path.join(root, 'js', 'events.js'), 'utf8') + fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
    var bad = src.match(/[–—…„“”]/g);
    check(!bad, 'typografické znaky mimo font: ' + bad);
})();

// ---------- bot ----------
var side = 0;
function tap() { side ^= 1; G._inject(side ? 'L' : 'R'); }
var PLAN = {
    lj: { v: 10.8, d: 0.25, ang: 28 }, jv: { v: 10.8, d: 0.3, ang: 35 }, hj: { v: 7.5, d: 1.2, ang: 68 }, pv: { v: 10.4, d: 1.6, ang: 72 },
    sp: { ang: 40 }, dt: { ang: 37 }
};
function botPlay(a, o) {
    var d = a.def, ph = a.phase, plan = PLAN[d.id], per = o.period;
    if (d.kind === 'race') {
        if (d.hurdles && ph === 'run' && a.jumpT < 0) {
            for (var i = 0; i < a.hurdles.length; i++) {
                var h = a.hurdles[i];
                if (!h.done) { var dist = h.x - a.pos; if (dist > 0 && dist < o.hd) { G._inject('A'); } break; }
            }
        }
        var pace = 1;
        if (d.stam && o.pace) { pace = a.stam > 0.5 ? 1 : 1.6; }
        if (a.t % Math.round(per * pace) === 0) { tap(); }
        return;
    }
    if (ph === 'ready' || ph === 'run') {
        if (d.runway) {
            if (a.t % per === 0 && a.v < plan.v) { tap(); }
            if (ph === 'run' && d.len - a.pos <= plan.d) { G._inject('A'); }
        } else {
            if (a.t % per === 0 && a.power < 0.97) { tap(); }
            if (a.power >= 0.95) { G._inject('A'); }
        }
    } else if (ph === 'angle') {
        var target = plan.ang + (o.angErr || 0);
        if (Math.abs(a.ang - target) < 1.2) { G._inject('A'); }
    }
}

function numsOk(a) {
    var ks = ['pos', 'v', 'scroll', 'stam', 'power', 'ang', 'clock', 'flT'];
    for (var i = 0; i < ks.length; i++) { if (!isFinite(a[ks[i]])) { return ks[i]; } }
    return null;
}

var seen = {};
// spustí hru botem; vrací souhrn
function runGame(nPlayers, bots, opt) {
    opt = opt || {};
    G._press('', 0);
    var guard = 0, s;
    seen = {};
    G._start(nPlayers);
    var snapped = {};
    while (guard++ < 400000) {
        s = G._get();
        seen[s.state] = true;
        if (s.state === 'over') { break; }
        if (s.state === 'play') {
            var o = bots[s.cur % bots.length];
            botPlay(s.att, o);
            var bad = numsOk(s.att);
            if (bad) { check(false, 'NaN v ' + bad); break; }
            if (opt.snaps) {
                var a = s.att, key = a.def.id + '_' + a.phase;
                var mid = a.phase === 'flight' && a.flT === Math.floor(a.flLen / 2);
                if ((a.phase === 'run' && a.clock === 120) || (a.phase === 'angle' && a.angT === 20) || mid || (a.phase === 'done' && a.t % 1 === 0 && !snapped[a.def.id + '_done'])) {
                    var nm = a.def.id + '_' + a.phase + (mid ? '_mid' : '');
                    if (!snapped[nm]) { snapped[nm] = true; snap(nm); }
                }
            }
        } else if (s.state === 'intro' || s.state === 'table') {
            if (opt.snaps && !snapped[s.state + s.evIdx] && s.evIdx % 3 === 0) { snapped[s.state + s.evIdx] = true; G._tick(); snap(s.state + s.evIdx); }
            for (var k = 0; k < 30; k++) { G._tick(); }
            G._press('A');
            continue;
        } else if (s.state === 'result' || s.state === 'dying') {
            if (opt.snaps && !snapped[s.state + s.evIdx]) { snapped[s.state + s.evIdx] = true; for (var q = 0; q < 40; q++) { G._tick(); } snap(s.state + s.evIdx + '_' + s.cur); }
        }
        G._tick();
        if (guard % 50 === 0) { G._draw(); }
    }
    check(G._get().state === 'over', 'hra skončila (stav ' + G._get().state + ')');
    return G._get();
}
function totals(s) { return s.players.map(function (p) { return p.pts.reduce(function (x, y) { return x + y; }, 0); }); }

// 1) titulní obrazovka -> nastavení
G._draw(); check(G._get().state === 'title', 'start v titulní obrazovce');
snap('title');
G._tick(); G._press('A'); check(G._get().state === 'setup', 'title -> setup');
G._draw(); snap('setup');
G._press('R'); G._press('R'); check(true, '');
G._press('', 3);

// 2) dobrý bot, 1 hráč: projde všech 10 disciplín
var good = { period: 5, hd: 2.0, pace: true };
console.log('--- dobrý bot, 1 hráč ---');
var s1 = runGame(1, [good], { snaps: true });
var pl = s1.players[0];
EV.forEach(function (d, i) {
    var b = pl.es[i].best;
    console.log(rpad(d.name, 16) + rpad(b === null ? '-' : d.fmt(b), 12) + pl.pts[i] + ' b');
    check(b !== null && pl.pts[i] > 0, 'disciplína ' + d.name + ' má výsledek');
});
console.log('celkem ' + totals(s1)[0] + ', životy ' + pl.lives);
check(pl.lives === 3, 'dobrý bot neztratil život (' + pl.lives + ')');
check(['intro', 'play', 'result', 'table', 'over'].every(function (k) { return seen[k]; }), 'viděné stavy: ' + Object.keys(seen).join(','));
snap('over');
check(storage['desetiboj.hi'] === String(totals(s1)[0]), 'rekord uložen do localStorage');
function rpad(s, n) { s = String(s); while (s.length < n) { s += ' '; } return s; }

// 3) pomalý bot: neprojde kvalifikací -> dying -> vyřazení -> over
console.log('--- špatný bot ---');
var s2 = runGame(2, [{ period: 12, hd: 2.0 }, { period: 5, hd: 2.0, pace: true }], { snaps: true });
check(seen.dying, 'stav dying nastal');
check(s2.players[0].elim === true, 'pomalý hráč vyřazen');
check(s2.players[0].lives === 0, 'pomalý hráč bez životů');
console.log('součty: ' + totals(s2).join(', ') + ' (hráč 1 vyřazen: ' + s2.players[0].elim + ')');
check(totals(s2)[1] > totals(s2)[0], 'dobrý hráč vede');

// 4) 4 hráči, různé tempo – pořadí odpovídá frekvenci
console.log('--- 4 hráči ---');
var s3 = runGame(4, [{ period: 5, hd: 2.0, pace: true }, { period: 6, hd: 2.0, pace: true }, { period: 7, hd: 2.0, pace: true }, { period: 8, hd: 2.0, pace: true }]);
console.log('součty: ' + totals(s3).join(', '));
var t3 = totals(s3);
check(t3[0] >= t3[1] && t3[1] >= t3[2] - 50, 'rychlejší tempo = více bodů (' + t3.join(',') + ')');
snap('over4');

// 5) technické faule: pozdní odraz / špatný úhel
console.log('--- faule ---');
(function () {
    function attempt(id, fn) {
        var def = EV.filter(function (e) { return e.id === id; })[0];
        var a = DEC.newAttempt(def, { bar: def.startBar || 0 });
        var n = 0, side2 = 0;
        while (a.phase !== 'done' && n++ < 20000) { fn(a, function (x) { return x; }); }
        return a;
    }
    // skok daleký: běh přes prkno bez odrazu
    var a = DEC.newAttempt(EV[1]);
    for (var i = 0; i < 4000 && a.phase !== 'done'; i++) { DEC.step(a, [i % 2 ? 'L' : 'R']); }
    check(a.phase === 'done' && !a.res.valid && /ZÁSTUP/.test(a.res.msg), 'zástup při přeběhnutí prkna: ' + a.res.msg);
    // úhel 0 u koule -> neplatný
    a = DEC.newAttempt(EV[2]);
    for (i = 0; i < 100; i++) { DEC.step(a, [i % 2 ? 'L' : 'R']); }
    DEC.step(a, ['A']);
    for (i = 0; i < 400 && !(a.angT > 40 && a.ang <= 4); i++) { DEC.step(a, []); }
    DEC.step(a, ['A']);
    for (i = 0; i < 100; i++) { DEC.step(a, []); }
    check(a.phase === 'done' && !a.res.valid, 'koule s úhlem ~0 je neplatná: ' + a.res.msg);
    // překážky: bez skoku se všechny shodí
    a = DEC.newAttempt(EV[5]);
    for (i = 0; i < 6000 && a.phase !== 'done'; i++) { DEC.step(a, [i % 5 === 0 ? (i % 10 ? 'L' : 'R') : null].filter(Boolean)); }
    check(a.phase === 'done' && a.hit === 10, 'bez skoku shozeno 10 překážek (' + a.hit + ')');
    // kontrola mačkání jedné klávesy: bez gainu
    a = DEC.newAttempt(EV[0]);
    for (i = 0; i < 200; i++) { DEC.step(a, ['L']); }
    check(a.v < 0.7, 'mačkání jedné klávesy nezrychluje (v=' + a.v.toFixed(2) + ')');
    // body
    check(DEC.points(EV[0], 10) > 800 && DEC.points(EV[0], 20) === 0, 'bodování 100 m');
    check(DEC.points(EV[1], 750) > 800, 'bodování dálka');
    check(DEC.points(EV[9], 10000) === 0 && DEC.points(EV[9], NaN) === 0, 'bodování ošetřuje extrémy');
    attempt; // nepoužito
})();

// 6) klávesnice, pauza, zvuk
(function () {
    G._press('A'); // do setup/intro? po over -> title
    var s = G._get();
    var fire = function (code) { (listeners.keydown || []).forEach(function (f) { f({ keyCode: code, repeat: false, preventDefault: function () { } }); }); };
    while (G._get().state !== 'title') { G._press('A'); for (var i = 0; i < 60; i++) { G._tick(); } if (++i > 1e5) { break; } }
    check(G._get().state === 'title', 'návrat na titul');
    fire(32); check(G._get().state === 'setup', 'mezerník na titulu -> setup');
    fire(51); fire(13);
    check(G._get().state === 'intro' && G._get().players.length === 3, 'klávesy 3 + Enter: tři hráči');
    for (var k = 0; k < 20; k++) { G._tick(); }
    fire(32); check(G._get().state === 'play', 'intro -> play');
    for (k = 0; k < 10; k++) { fire(k % 2 ? 37 : 39); G._tick(); }
    check(G._get().att.v > 1, 'střídání šipek rozbíhá atleta');
    fire(80); check(G._get().state === 'paused', 'P pauza');
    var c0 = G._get().att.clock; for (k = 0; k < 50; k++) { G._tick(); }
    G._draw(); snap('pause');
    check(G._get().att.clock === c0, 'v pauze se hra nehýbe');
    fire(80); check(G._get().state === 'play', 'P znovu = pokračování');
    fire(77); fire(77);
    document.hidden = true; (listeners.visibilitychange || []).forEach(function (f) { f(); });
    check(G._get().state === 'paused', 'visibilitychange -> pauza');
    document.hidden = false;
})();

console.log(fails ? ('\nSELHÁNÍ: ' + fails) : '\nVšechny headless testy prošly.');
process.exit(fails ? 1 : 0);
