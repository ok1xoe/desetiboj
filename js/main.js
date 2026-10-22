// Hra Desetiboj: stavy hry, vykreslení, vstup, smyčka (50 Hz).
(function (root) {
    'use strict';

    var DEC = root.DEC;
    var EV = DEC.EVENTS, C = DEC.CONST;
    var canvas = document.getElementById('screen');
    var ctx = canvas.getContext('2d');
    var scr = new DEC.Screen();

    var state = 'title';       // title | setup | intro | play | result | dying | table | over | paused
    var prevState = 'play';
    var players = [], np = 1, evIdx = 0, cur = 0, att = null, costsLife = false, elimNow = false;
    var stateTimer = 0, stateAge = 0, frame = 0, hi = 0, newRecord = false;
    var inq = [];
    var PCOL = [7, 5, 6, 4];            // barvy hráčů (jasná bílá, azurová, žlutá, zelená)
    var GY = 120;                           // horní hrana země (y)

    try { hi = parseInt(localStorage.getItem('desetiboj.hi'), 10) || 0; } catch (e) { hi = 0; }

    // ---------- pomocné ----------
    function pad(n, len) { var s = String(n); while (s.length < len) { s = '0' + s; } return s; }
    function lpad(s, len) { s = String(s); while (s.length < len) { s = ' ' + s; } return s; }
    function rpad(s, len) { s = String(s); while (s.length < len) { s += ' '; } return s; }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function px(x, y, ink) { scr.block(Math.floor(x), Math.floor(y), 1, 1, 1, ink, true); }
    function rect(x, y, w, h, ink) { scr.block(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), 1, ink, true); }
    function clearBits(x, y, w, h) { scr.block(x, y, w, h, 0, 0, false); }

    function line(row, str, ink, x) {
        var px0 = x === undefined ? Math.floor((256 - DEC.textWidth(str, 1)) / 2) : x;
        DEC.drawText(scr, px0, row * 8 - 1, str, ink, 1);
    }
    function textAt(x, y, str, ink, scale) { DEC.drawText(scr, x, y, str, ink, scale || 1); }
    function textRight(row, str, ink) { line(row, str, ink, 252 - DEC.textWidth(str, 1)); }

    function seg(x0, y0, x1, y1, ink) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, n = 0;
        while (n++ < 600) {
            px(x0, y0, ink);
            if (x0 === x1 && y0 === y1) { break; }
            var e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    function setBorder(color) {
        var c = DEC.PAL[color & 7];
        document.body.style.background = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }

    function totalPts(pl) { var s = 0; for (var i = 0; i < pl.pts.length; i++) { s += pl.pts[i]; } return s; }
    function curEv() { return EV[evIdx]; }
    function curPl() { return players[cur]; }
    function curEs() { return players[cur].es[evIdx]; }

    // ---------- průběh hry ----------
    function startGame(n) {
        np = clamp(n || np, 1, 4);
        players = [];
        for (var i = 0; i < np; i++) {
            var es = [];
            for (var e = 0; e < EV.length; e++) {
                es.push({ tries: 0, fails: 0, best: null, ended: false, bar: EV[e].startBar || 0, last: null });
            }
            players.push({ name: 'HRÁČ ' + (i + 1), lives: 3, elim: false, es: es, pts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
        }
        evIdx = 0; cur = 0; att = null; newRecord = false;
        goIntro();
    }

    function goIntro() {
        state = 'intro';
        stateAge = 0;
        att = null;
        setBorder(1);
        DEC.sound.stopTune();
    }

    function beginPlay() {
        var def = curEv();
        att = DEC.newAttempt(def, { bar: curEs().bar });
        inq.length = 0;
        state = 'play';
        stateAge = 0;
        setBorder(def.runway === false ? 4 : 2);
        DEC.sound.gun();
    }

    function toTitle() {
        state = 'title';
        setBorder(0);
        DEC.sound.startTune();
    }

    function allElim() {
        for (var i = 0; i < players.length; i++) { if (!players[i].elim) { return false; } }
        return true;
    }

    function firstActive() {
        for (var i = 0; i < players.length; i++) { if (!players[i].elim) { return i; } }
        return -1;
    }

    function finishAttempt() {
        var def = curEv(), pl = curPl(), pes = curEs(), res = att.res;
        costsLife = false; elimNow = false;
        pes.last = res;
        if (def.kind === 'race') {
            pes.tries++;
            if (res.valid) { pes.best = res.value; pes.ended = true; }
            else { costsLife = true; if (pes.tries >= 3) { pes.ended = true; } }
        } else if (def.kind === 'bar') {
            if (res.valid) {
                pes.best = pes.bar; pes.bar += def.step; pes.fails = 0;
                if (pes.bar > def.maxBar) { pes.ended = true; }
            } else {
                pes.fails++;
                if (pes.best === null) { costsLife = true; }
                if (pes.fails >= 3) { pes.ended = true; }
            }
            pes.tries++;
        } else {
            pes.tries++;
            if (res.valid) { if (pes.best === null || res.value > pes.best) { pes.best = res.value; } }
            else if (pes.best === null) { costsLife = true; }
            if (pes.tries >= 3) { pes.ended = true; }
        }
        if (costsLife) {
            pl.lives--;
            if (pl.lives <= 0) { pl.lives = 0; pl.elim = true; pes.ended = true; elimNow = true; }
        }
        state = costsLife ? 'dying' : 'result';
        stateTimer = costsLife ? 110 : 120;
        stateAge = 0;
        if (costsLife) { DEC.sound.die(); }
    }

    function afterAttempt() {
        var pes = curEs();
        if (!pes.ended) { beginPlay(); return; }
        nextTurn();
    }

    function nextTurn() {
        for (var i = cur + 1; i < players.length; i++) {
            if (!players[i].elim && !players[i].es[evIdx].ended) { cur = i; goIntro(); return; }
        }
        endEvent();
    }

    function endEvent() {
        var def = curEv();
        for (var i = 0; i < players.length; i++) {
            players[i].pts[evIdx] = DEC.points(def, players[i].es[evIdx].best);
        }
        saveHi();
        state = 'table';
        stateAge = 0;
        setBorder(1);
        DEC.sound.good();
    }

    function saveHi() {
        var best = 0;
        for (var i = 0; i < players.length; i++) { best = Math.max(best, totalPts(players[i])); }
        if (best > hi) {
            hi = best; newRecord = true;
            try { localStorage.setItem('desetiboj.hi', String(hi)); } catch (e) { /* ignorovat */ }
        }
    }

    function nextEvent() {
        evIdx++;
        if (evIdx >= EV.length || allElim()) {
            evIdx = Math.min(evIdx, EV.length - 1);
            state = 'over';
            stateAge = 0;
            saveHi();
            if (newRecord) { DEC.sound.win(); } else { DEC.sound.over(); }
            return;
        }
        cur = firstActive();
        if (cur < 0) { state = 'over'; stateAge = 0; return; }
        goIntro();
    }

    function playTick() {
        var syms = inq.splice(0, inq.length);
        DEC.step(att, syms);
        var ev = att.ev;
        for (var i = 0; i < ev.length; i++) {
            switch (ev[i]) {
                case 'tap': DEC.sound.tap(att.v); break;
                case 'jump': DEC.sound.jump(); break;
                case 'throw': DEC.sound.throwIt(); break;
                case 'hit': DEC.sound.hit(); break;
                case 'thud': DEC.sound.thud(); break;
                case 'good': DEC.sound.good(); break;
                case 'foul': DEC.sound.foul(); break;
                default: break;
            }
        }
        if (att.phase === 'angle' && (att.angT & 7) === 1) { DEC.sound.angle(); }
        if (att.phase === 'done') { finishAttempt(); }
    }

    function tick() {
        frame++;
        stateAge++;
        switch (state) {
            case 'play': playTick(); break;
            case 'result':
            case 'dying':
                if (att && att.phase === 'done') { /* animace atleta běží dál */ }
                if (--stateTimer <= 0) { afterAttempt(); }
                break;
            default: break;
        }
    }

    // ---------- vstup ----------
    function press(sym, digit) {
        DEC.sound.unlock();
        switch (state) {
            case 'title':
                if (sym === 'A') { state = 'setup'; stateAge = 0; }
                break;
            case 'setup':
                if (digit) { np = clamp(digit, 1, 4); }
                else if (sym === 'L') { np = Math.max(1, np - 1); }
                else if (sym === 'R') { np = Math.min(4, np + 1); }
                else if (sym === 'A') { startGame(np); }
                break;
            case 'intro':
                var def = curEv(), pes = curEs();
                if (def.kind === 'bar' && pes.best === null && pes.tries === 0 && (sym === 'L' || sym === 'R')) {
                    pes.bar = clamp(pes.bar + (sym === 'R' ? 1 : -1) * def.step, def.minBar, def.maxBar - def.step);
                } else if (sym === 'A' && stateAge > 12) { beginPlay(); }
                break;
            case 'play':
                if (inq.length < 24) { inq.push(sym); }
                break;
            case 'result':
            case 'dying':
                if (sym === 'A' && stateAge > 50) { stateTimer = 0; }
                break;
            case 'table':
                if (sym === 'A' && stateAge > 25) { nextEvent(); }
                break;
            case 'over':
                if (sym === 'A' && stateAge > 50) { toTitle(); }
                break;
            default: break;
        }
    }

    function togglePause() {
        if (state === 'paused') { state = prevState; }
        else if (state === 'play' || state === 'result' || state === 'dying' || state === 'intro') { prevState = state; state = 'paused'; }
    }

    var KEYS = { 37: 'L', 65: 'L', 39: 'R', 68: 'R', 32: 'A', 13: 'A', 38: 'A', 87: 'A' };

    document.addEventListener('keydown', function (e) {
        var k = KEYS[e.keyCode];
        if (k) {
            e.preventDefault();
            if (!e.repeat) { press(k); }
        } else if (e.keyCode === 40 || e.keyCode === 83) {
            e.preventDefault();
        } else if (e.keyCode >= 49 && e.keyCode <= 52) {
            press('', e.keyCode - 48);
        } else if (e.keyCode === 80) {
            togglePause();
        } else if (e.keyCode === 77) {
            if (!DEC.sound.toggleMute() && state === 'title') { DEC.sound.startTune(); }
        }
        DEC.sound.unlock();
    });

    // dotyková tlačítka
    Array.prototype.forEach.call(document.querySelectorAll('#touch button'), function (b) {
        var act = b.getAttribute('data-act');
        b.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            DEC.sound.unlock();
            if (act === 'pause') { togglePause(); return; }
            press(act === 'left' ? 'L' : (act === 'right' ? 'R' : 'A'));
        });
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    canvas.addEventListener('pointerdown', function () {
        if (state === 'title' || state === 'over' || state === 'table') { press('A'); }
        else if (state === 'paused') { togglePause(); }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && (state === 'play' || state === 'result' || state === 'dying')) { prevState = state; state = 'paused'; }
    });

    // ---------- celočíselné měřítko ----------
    function fit() {
        var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var availH = window.innerHeight - (touch ? 150 : 24);
        var s = Math.min(window.innerWidth / 256, availH / 192);
        s = s >= 1 ? Math.floor(s) : Math.max(0.5, s);
        canvas.style.width = Math.round(256 * s) + 'px';
        canvas.style.height = Math.round(192 * s) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();

    // ---------- vykreslení: scéna ----------
    function camOf(a) {
        var d = a.def;
        if (d.kind === 'race') { return a.scroll - 60; }
        if (d.runway) { return (a.take ? a.take.pos : a.pos) * 8 - 60; }
        return 0;
    }

    function drawBackdrop(def, cam) {
        var grass = def.runway === false;
        var cx, cy, x, y;
        scr.clear(0, 7);
        scr.fillCells(0, 3, 32, 5, 7, 5, 0);                       // obloha
        // mraky
        for (var k = 0; k < 3; k++) {
            var cxm = ((k * 97 + 30 - Math.floor(cam / 6)) % 300 + 300) % 300 - 30;
            scr.block(cxm, 32 + k * 4, 22, 3, 1, 7, false);
            scr.block(cxm + 4, 30 + k * 4, 14, 2, 1, 7, false);
        }
        // tribuna (řídké, tmavé diváky), reklamní pás a tmavá zeď za atletem
        var cam2 = Math.floor(cam / 2);
        for (cy = 8; cy < 15; cy++) {
            for (cx = 0; cx < 32; cx++) {
                if (cy < 12) { scr.setCell(cx, cy, [2, 3, 4, 6, 7, 5][(cx * 5 + cy * 3) % 6], 0, 0); }
                else if (cy === 12) { scr.setCell(cx, cy, 7, 1, 1); }
                else { scr.setCell(cx, cy, 7, 1, 0); }
            }
        }
        for (y = 64; y < 96; y++) {
            for (x = 0; x < 256; x++) {
                var X2 = x + cam2;
                if ((((X2 >> 1) + (y >> 1)) & 1) === 0 && (((X2 * 7) + (y * 13)) & 7) < 3) { scr.bits[y * 256 + x] = 1; }
            }
        }
        for (x = 0; x < 256; x++) {                                 // reklamní pás
            if ((((x + cam2) >> 3) & 1) === 0) { for (y = 98; y < 102; y++) { scr.bits[y * 256 + x] = 1; } }
        }
        // dráha / tráva
        if (grass) { scr.fillCells(0, 15, 32, 3, 7, 4, 0); }
        else { scr.fillCells(0, 15, 32, 3, 7, 2, 1); }
        if (!grass) {
            scr.block(0, 130, 256, 1, 1, 7, false);
            var k0 = Math.floor(cam / 48);
            for (var kk = k0; kk < k0 + 7; kk++) { scr.block(kk * 48 - cam, 135, 14, 2, 1, 7, false); }
        }
    }

    function drawRing() {
        for (var a = 0; a < 360; a += 4) {
            var r = a * Math.PI / 180;
            px(41 + Math.cos(r) * 22, 123 + Math.sin(r) * 4, 7);
        }
    }

    function drawObjects(def, a, cam) {
        var i, X = 55, Y = 104;
        if (def.kind === 'race') {
            var fx = 60 + (def.len - a.pos) / def.vmul * 8;
            if (fx > -6 && fx < 262) {
                for (i = 0; i < 12; i++) {
                    rect(fx, GY + i * 2, 2, 2, (i & 1) ? 7 : 8);
                    rect(fx + 2, GY + i * 2, 2, 2, (i & 1) ? 8 : 7);
                }
            }
            if (a.hurdles) {
                a.hurdles.forEach(function (hu) {
                    var hx = 60 + (hu.x - a.pos) * 8;
                    if (hx < -10 || hx > 264) { return; }
                    if (hu.down) { rect(hx - 6, 117, 12, 3, 15); }
                    else { rect(hx, 106, 2, 14, 15); rect(hx - 3, 106, 8, 2, 15); }
                });
            }
            return;
        }
        if (!def.runway) {
            drawRing();
            return;
        }
        var bx = def.len * 8 - cam;           // prkno / čára / lať
        if (def.id === 'lj') {
            scr.fillCells(Math.max(0, Math.floor((bx + 10) / 8)), 15, 32, 3, 0, 6, 1);
            rect(bx - 1, GY, 4, 24, 7);
            if (a.fl && a.fl.kind === 'lj' && a.phase !== 'ready') {
                // ukazatel dopadu
                if (a.phase === 'done') { rect(60 + a.fl.dist * 8, GY, 1, 12, 14); }
            }
        } else if (def.id === 'jv') {
            rect(bx, GY, 2, 24, 15);
        } else {
            var hj = def.id === 'hj';
            var sc = hj ? 0.12 : 0.07;
            var barpx = Math.round(a.bar * sc);
            var mx = bx + 8;
            // žíněnka
            rect(mx, 112, hj ? 40 : 48, 8, 3);
            // stojany
            rect(bx - 8, GY - Math.round(def.maxBar * sc) , 1, Math.round(def.maxBar * sc), 7);
            rect(bx + 8, GY - Math.round(def.maxBar * sc), 1, Math.round(def.maxBar * sc), 7);
            var fallen = a.fl && a.phase !== 'ready' && !a.fl.ok && a.fl.kind !== 'bad' && a.phase !== 'run' && a.phase !== 'angle' && a.flT > 8;
            if (fallen) { rect(bx - 6, 110, 13, 1, 14); }
            else { rect(bx - 7, GY - barpx, 15, 1, 14); }
        }
    }

    // pozice a póza atleta
    function poseOf(def, a) {
        var X = 55, Y = 104, p = { spr: 'stand', x: X, y: Y, flip: false }, ph = a.phase, u;
        var runFrame = ((a.scroll / 7) | 0) & 1 ? 'runA' : 'runB';
        if (def.kind === 'race') {
            if (ph === 'done') { p.spr = a.res.valid ? 'cheer' : 'fall'; if (!a.res.valid) { p.y = 114; } }
            else if (ph === 'ready') { p.spr = 'stand'; }
            else if (a.jumpT >= 0) { p.spr = 'hurdle'; p.y = Y - Math.round(Math.sin(Math.PI * a.jumpT / C.JT) * 14); }
            else { p.spr = a.v < 0.3 ? 'stand' : runFrame; }
            return p;
        }
        if (!def.runway) {
            X = 35;
            p.x = X;
            if (ph === 'ready') { p.spr = 'stand'; }
            else if (ph === 'run') { p.spr = a.power > 0.03 ? (((a.t >> 3) & 1) ? 'back' : 'fwd') : 'stand'; }
            else if (ph === 'angle') { p.spr = 'back'; }
            else if (ph === 'flight') { p.spr = 'fwd'; }
            else { p.spr = a.res.valid ? 'cheer' : 'fall'; if (!a.res.valid) { p.y = 114; } }
            return p;
        }
        if (ph === 'ready') { return p; }
        if (ph === 'run') { p.spr = a.v < 0.3 ? 'stand' : runFrame; return p; }
        if (ph === 'angle') { p.spr = def.id === 'jv' ? 'back' : 'air'; return p; }
        var fl = a.fl || { kind: 'bad' };
        u = a.flLen > 0 ? clamp(a.flT / a.flLen, 0, 1) : 1;
        if (ph === 'flight' || ph === 'done') {
            if (fl.kind === 'bad') { p.spr = 'fall'; p.y = 114; p.x = X + (ph === 'done' ? 6 : Math.round(u * 6)); return p; }
            if (def.id === 'jv') {
                p.spr = ph === 'done' ? (a.res.valid ? 'cheer' : 'fall') : 'fwd';
                if (ph === 'done' && !a.res.valid) { p.y = 114; }
                return p;
            }
            if (def.id === 'lj') {
                var L = fl.dist * 8;
                if (ph === 'done') { p.spr = 'cheer'; p.x = X + Math.round(L) - 2; return p; }
                p.x = X + Math.round(L * u);
                p.y = Y - Math.round(4 * u * (1 - u) * (10 + 14 * Math.sin(a.ang * Math.PI / 180)));
                p.spr = u > 0.92 ? 'stand' : 'air';
                return p;
            }
            // lať: skok vysoký / o tyči
            var hj = def.id === 'hj', sc = hj ? 0.12 : 0.07;
            var barpx = Math.round(a.bar * sc);
            var bxs = 60 + fl.dist * 8;
            var endx = bxs + 24;
            var ub = clamp((bxs - X) / (endx - X), 0.15, 0.85);
            var target = fl.ok ? barpx + 2 : Math.max(2, barpx - 10);
            var peak = target / (4 * ub * (1 - ub));
            if (ph === 'done') { p.spr = 'fall'; p.x = bxs + 12; p.y = 106; return p; }
            var uu = fl.ok ? u : Math.min(u, ub + 0.08);
            p.x = Math.round(X + uu * (endx - X));
            p.y = Y - Math.round(peak * 4 * uu * (1 - uu));
            if (!fl.ok && u > ub + 0.08) { p.y = Math.min(110, p.y + Math.round((u - ub - 0.08) * 90)); p.spr = 'fall'; }
            else { p.spr = 'air'; }
            if (p.y > 108 && p.spr === 'air') { p.y = 108; }
            return p;
        }
        return p;
    }

    function drawAthlete(def, a, col) {
        var p = poseOf(def, a);
        var rows = DEC.SPR[p.spr];
        scr.sprite(p.x, p.y, rows, col, p.flip);
        // doplňky: tyč, oštěp, vržený předmět
        if (def.id === 'pv') {
            if (a.phase === 'ready' || a.phase === 'run') { seg(p.x - 10, p.y + 12, p.x + 24, p.y + 6, 14); }
            else if (a.fl && a.fl.kind !== 'bad' && !(a.phase === 'flight' && a.flT / a.flLen > 0.6) && a.phase !== 'done') {
                var bxp = 60 + a.fl.dist * 8 - 10;
                seg(p.x + 8, p.y + 5, bxp, 119, 14);
            } else if (a.phase === 'angle') { seg(p.x + 8, p.y + 5, 55 + (def.len - (a.take ? a.take.pos : 0)) * 8 - 6, 119, 14); }
        }
        if (def.id === 'jv' && (a.phase === 'ready' || a.phase === 'run' || a.phase === 'angle')) {
            seg(p.x - 6, p.y + 9, p.x + 22, p.y + 5, 15);
        }
        if (a.fl && a.fl.kind !== 'bad' && (def.id === 'sp' || def.id === 'dt' || def.id === 'jv') && (a.phase === 'flight' || a.phase === 'done')) {
            drawThrown(def, a, p);
        } else if (!def.runway && (a.phase === 'run' || a.phase === 'angle' || a.phase === 'ready')) {
            // předmět v ruce
            if (def.id === 'sp') { rect(p.x + 8, p.y + 2, 3, 3, 15); }
            else { rect(p.x + 8, p.y + 3, 6, 1, 15); }
        }
    }

    function drawThrown(def, a, p) {
        var fl = a.fl, u = a.phase === 'done' ? 1 : clamp(a.flT / a.flLen, 0, 1);
        var sx0 = p.x + 9, sy0 = 106;
        var landX = sx0 + clamp(fl.dist / C.DMAX[def.id], 0, 1.05) * 180;
        var peak = 14 + 44 * Math.sin(a.ang * Math.PI / 180);
        function at(t) { return { x: sx0 + (landX - sx0) * t, y: sy0 + (119 - sy0) * t - peak * 4 * t * (1 - t) }; }
        var q = at(u);
        if (def.id === 'sp') { rect(q.x - 1, q.y - 1, 3, 3, 15); }
        else if (def.id === 'dt') { rect(q.x - 2, q.y, 5, 1, 15); px(q.x, q.y - 1, 15); }
        else {
            var q2 = at(Math.max(0, u - 0.04));
            seg(q.x, q.y, q.x - (q2.x === q.x ? 1 : (q.x - q2.x)) * 3, q.y - (q.y - q2.y) * 3, 15);
        }
        if (a.phase === 'done' || u >= 1) {
            rect(landX, 107, 1, 12, 14);
            rect(landX, 107, 5, 3, 14);
            textAt(Math.min(landX + 7, 256 - DEC.textWidth(def.fmt(fl.dist), 1)), 108, def.fmt(fl.dist), 14);
        }
    }

    // ---------- vykreslení: panel a HUD ----------
    function bar(x, y, w, h, frac, ink) {
        frac = isFinite(frac) ? clamp(frac, 0, 1) : 0;
        scr.block(x, y, w, h, 1, ink, true);
        scr.block(x + 1, y + 1, w - 2, h - 2, 0, 0, false);
        var fw = Math.floor((w - 2) * frac);
        if (fw > 0) { scr.block(x + 1, y + 1, fw, h - 2, 1, ink, true); }
    }

    function drawPanel(def, a) {
        var i;
        scr.fillCells(0, 18, 32, 6, 7, 0, 0);
        var blink = (frame >> 4) & 1;
        var ph = a.phase;
        if (def.kind === 'race') {
            textAt(4, 146, 'RYCHLOST', 7);
            bar(72, 146, 176, 8, a.v / C.VMAX, a.v / C.VMAX > 0.85 ? 12 : 14);
            textAt(4, 158, 'ČAS ' + DEC.fmtTime(a.clock / C.ST * def.tmul), 15);
            textRight(20, 'ZBÝVÁ ' + Math.max(0, Math.ceil(def.len - a.pos)) + ' M', 11);
            if (def.stam) {
                textAt(4, 170, 'VÝDRŽ', 7);
                bar(72, 170, 176, 8, a.stam, a.stam > 0.35 ? 12 : 10);
            }
            // postup
            scr.block(4, 184, 248, 4, 1, 7, true);
            scr.block(5, 185, 246, 2, 0, 0, false);
            rect(5 + Math.floor(clamp(a.pos / def.len, 0, 1) * 240), 184, 6, 4, 14);
            if (ph === 'ready') { line(22, blink ? 'STŘÍDAVĚ MAČKEJ ◀ ▶ = START' : '', 14); }
            else if (def.hurdles) { line(22, 'MEZERNÍK = SKOK PŘES PŘEKÁŽKU', 5); }
            return;
        }
        if (ph === 'ready' || ph === 'run') {
            if (def.runway) {
                textAt(4, 146, 'RYCHLOST', 7);
                bar(72, 146, 176, 8, a.v / C.VMAX, 12);
                var rem = Math.max(0, def.len - a.pos);
                textAt(4, 158, (def.kind === 'bar' ? 'DO LATĚ ' : (def.id === 'jv' ? 'DO ČÁRY ' : 'DO PRKNA ')) + (Math.round(rem * 10) / 10).toFixed(1).replace('.', ',') + ' M', 15);
                if (ph === 'ready') { line(22, blink ? 'STŘÍDAVĚ MAČKEJ ◀ ▶ = ROZBĚH' : '', 14); }
                else { line(22, 'MEZERNÍK = ' + (def.kind === 'bar' ? (def.id === 'pv' ? 'ZAPICHNI TYČ' : 'ODRAZ') : (def.id === 'jv' ? 'HOD' : 'ODRAZ')), 5); }
            } else {
                textAt(4, 146, 'SÍLA', 7);
                bar(72, 146, 176, 8, a.power, a.power > 0.8 ? 12 : 14);
                if (ph === 'run') { textAt(4, 158, 'ČAS ' + Math.max(0, Math.ceil(8 - a.clock / C.ST)) + ' S', 15); }
                if (ph === 'ready') { line(22, blink ? 'STŘÍDAVĚ MAČKEJ ◀ ▶ = ROZTOČENÍ' : '', 14); }
                else { line(22, 'MEZERNÍK = ZAMKNI SÍLU', 5); }
            }
            return;
        }
        if (ph === 'angle') {
            textAt(4, 146, 'ÚHEL', 7);
            var gx = 72, gw = 176;
            scr.block(gx, 146, gw, 8, 1, 7, true);
            scr.block(gx + 1, 147, gw - 2, 6, 0, 0, false);
            for (i = 0; i <= 6; i++) { rect(gx + Math.round(i * gw / 6) - (i === 6 ? 1 : 0), 154, 1, 3, 7); }
            rect(gx + 1 + Math.round(a.ang / 90 * (gw - 6)), 146, 4, 8, 14);
            textAt(4, 158, Math.round(a.ang) + '°', 15);
            textAt(72, 160, '0', 7); textAt(72 + 85, 160, '45', 7); textAt(72 + 168, 160, '90', 7);
            line(22, 'MEZERNÍK = ZASTAV ÚHEL', 5);
            return;
        }
        // let / hotovo
        if (def.runway) { textAt(4, 146, 'RYCHLOST', 7); bar(72, 146, 176, 8, (a.take ? a.take.v : 0) / C.VMAX, 12); }
        else { textAt(4, 146, 'SÍLA', 7); bar(72, 146, 176, 8, a.take ? a.take.p : 0, 12); }
        textAt(4, 158, 'ÚHEL ' + Math.round(a.ang) + '°', 15);
    }

    function drawHud(def) {
        var pl = curPl(), pes = curEs();
        scr.fillCells(0, 0, 32, 3, 7, 1, 1);
        textAt(4, -1, def.name, 14);
        textRight(0, (def.day) + '. DEN   ' + (evIdx + 1) + '/10', 15);
        textAt(4, 7, pl.name, PCOL[cur]);
        var lv = '';
        for (var i = 0; i < pl.lives; i++) { lv += '*'; }
        textRight(1, 'ŽIVOTY ' + lv, 10);
        var info;
        if (def.kind === 'bar') { info = 'LAŤ ' + def.fmt(pes.bar) + '  SELHÁNÍ ' + pes.fails + '/3'; }
        else if (def.kind === 'race') { info = 'POKUS ' + Math.min(3, pes.tries + 1) + '/3   KVALIFIKACE ' + DEC.fmtTime(def.qual); }
        else { info = 'POKUS ' + Math.min(3, pes.tries + 1) + '/3'; }
        textAt(4, 15, info, 7);
        if (def.kind !== 'race' && pes.best !== null) { textRight(2, 'NEJLEPŠÍ ' + def.fmt(pes.best), 12); }
    }

    function banner(l1, l2, l3, ink) {
        scr.fillCells(2, 4, 28, 5, 7, 1, 1);
        clearBits(16, 32, 224, 40);
        line(4, l1, ink || 15);
        if (l2) { line(6, l2, 14); }
        if (l3) { line(7, l3, 10); }
    }

    function resultBanner() {
        var def = curEv(), res = att.res, pes = curEs(), pl = curPl();
        if (res.valid) {
            if (def.kind === 'bar') { banner('PŘESKOČENO ' + def.fmt(res.value), 'BODY ' + DEC.points(def, pes.best), null, 12); }
            else { banner(def.fmt(res.value), 'BODY ' + DEC.points(def, pes.best), null, 12); }
        } else {
            var l3 = elimNow ? 'VYŘAZEN Z DESETIBOJE!' : (costsLife ? 'ŽIVOT -1  ZBÝVÁ ' + pl.lives : 'POKUS SE NEPOČÍTÁ DO ŽIVOTŮ');
            banner(res.msg || 'NEPLATNÝ POKUS', null, l3, 10);
        }
    }

    function drawPlay() {
        var def = curEv(), a = att;
        if (!a) { return; }
        var cam = camOf(a);
        drawBackdrop(def, cam);
        drawObjects(def, a, cam);
        drawAthlete(def, a, PCOL[cur]);
        drawPanel(def, a);
        drawHud(def);
    }

    // ---------- obrazovky ----------
    function stripes(x, y, w) {
        var cols = [10, 14, 12, 13];       // červená, žlutá, zelená, azurová
        for (var i = 0; i < 4; i++) {
            for (var k = 0; k < 8; k++) {
                scr.block(x + i * 8 + k * 2 + 0, y + k, 2, 1, 1, cols[i], false);
            }
        }
        void w;
    }

    function drawTitle() {
        scr.clear(0, 7);
        scr.clear(1, 7);
        var title = 'DESETIBOJ';
        var x = Math.floor((256 - DEC.textWidth(title, 3)) / 2);
        var cols = [10, 14, 12, 13, 11, 15, 14, 12, 10];
        for (var i = 0; i < title.length; i++) {
            DEC.drawText(scr, x + i * 18, 10, title.charAt(i), cols[(i + (frame >> 3)) % cols.length], 3);
        }
        // pruhy ve stylu ZX
        // dráha
        scr.fillCells(0, 13, 32, 2, 7, 2, 1);
        var wx = (frame * 2) % 300 - 20;
        scr.sprite(wx, 100, DEC.SPR[((frame >> 3) & 1) ? 'runA' : 'runB'], PCOL[(frame >> 8) & 3], false);
        scr.block(0, 118, 256, 1, 1, 7, false);
        line(5, 'DEN 1: 100 M, DÁL, KOULE, VÝŠKA, 400 M', 5);
        line(6, 'DEN 2: PŘEKÁŽKY, DISK, TYČ, OŠTĚP, 1500 M', 5);
        line(8, 'REKORD ' + pad(hi, 5), 14);
        line(16, 'STŘÍDAVĚ MAČKEJ ◀ ▶ (NEBO A D) = BĚH', 7);
        line(17, 'MEZERNÍK / ENTER / W = SKOK, HOD, ÚHEL', 7);
        line(18, 'DOTYK: TLAČÍTKA ◀ ▶ A AKCE', 7);
        line(19, 'P - PAUZA     M - ZVUK', 7);
        line(20, '3 ŽIVOTY, 3 POKUSY, 1-4 HRÁČI', 6);
        if ((frame >> 4) & 1) { line(22, 'STISKNI MEZERNÍK NEBO KLEPNI', 15); }
    }

    function drawSetup() {
        scr.clear(1, 7);
        line(2, 'NOVÝ DESETIBOJ', 14);
        line(5, 'POČET HRÁČŮ (STŘÍDAJÍ SE NA JEDNOM ZAŘÍZENÍ)', 7);
        var s = String(np);
        DEC.drawText(scr, 128 - 9, 70, s, 15, 3);
        textAt(70, 72, '◀', (frame >> 4) & 1 ? 14 : 7, 2);
        textAt(166, 72, '▶', (frame >> 4) & 1 ? 14 : 7, 2);
        for (var i = 0; i < np; i++) {
            scr.sprite(128 - np * 8 + i * 16 + 3, 110, DEC.SPR.stand, PCOL[i], false);
            line(17, '', 7);
        }
        line(20, 'ŠIPKY NEBO 1-4 = VOLBA', 7);
        if ((frame >> 4) & 1) { line(22, 'MEZERNÍK = START', 15); }
    }

    function drawIntro() {
        var def = curEv(), pes = curEs();
        scr.clear(1, 7);
        line(1, def.day + '. DEN - DISCIPLÍNA ' + (evIdx + 1) + ' Z 10', 5);
        var w = DEC.textWidth(def.name, 2);
        DEC.drawText(scr, Math.floor((256 - w) / 2), 22, def.name, 14, 2);
        line(7, curPl().name, PCOL[cur]);
        scr.sprite(123, 82, DEC.SPR[((frame >> 4) & 1) ? 'stand' : 'cheer'], PCOL[cur], false);
        var y = 13;
        def.help.forEach(function (h) { line(y, h, 7); y += 1; });
        if (def.kind === 'bar') {
            if (pes.best === null && pes.tries === 0) {
                line(18, '◀ VÝŠKA LATĚ ' + def.fmt(pes.bar) + ' ▶', 14);
            } else { line(18, 'LAŤ ' + def.fmt(pes.bar), 14); }
        } else if (def.kind === 'race') { line(18, 'ZBÝVÁ POKUSŮ: ' + (3 - pes.tries), 14); }
        else { line(18, 'POKUS ' + (pes.tries + 1) + ' ZE 3', 14); }
        line(20, 'ŽIVOTY: ' + curPl().lives, 10);
        if ((frame >> 4) & 1) { line(22, 'MEZERNÍK = ZAČÍT', 15); }
    }

    function sheet(row, from, to, hdr) {
        var i, p;
        var head = rpad('', 6);
        for (i = from; i < to; i++) { head += lpad(EV[i].short, 6); }
        line(row, head, 5, 6);
        void hdr;
        for (p = 0; p < players.length; p++) {
            var s = rpad('H' + (p + 1), 6);
            for (i = from; i < to; i++) { s += lpad(players[p].pts[i], 6); }
            line(row + 1 + p, s, PCOL[p], 6);
        }
    }

    function drawTable() {
        scr.clear(1, 7);
        var def = curEv();
        line(1, 'VÝSLEDKY: ' + def.name, 14);
        for (var p = 0; p < players.length; p++) {
            var pl = players[p], pes = pl.es[evIdx];
            var val = pes.best === null ? 'BEZ VÝSLEDKU' : def.fmt(pes.best);
            line(3 + p, rpad(pl.name, 8) + lpad(val, 12) + lpad(pl.pts[evIdx], 5) + ' B', PCOL[p], 12);
        }
        sheet(9, 0, 5);
        sheet(15, 5, 10);
        var tot = '';
        for (p = 0; p < players.length; p++) { tot += (p ? '   ' : '') + 'H' + (p + 1) + ': ' + totalPts(players[p]); }
        line(20, 'CELKEM  ' + tot, 15);
        if (newRecord) { line(22, 'NOVÝ REKORD!', (frame >> 3) & 1 ? 14 : 10); }
        else if ((frame >> 4) & 1) { line(22, 'MEZERNÍK = DÁL', 15); }
    }

    function drawOver() {
        scr.clear(1, 7);
        line(1, 'KONEC DESETIBOJE', 14);
        var order = players.map(function (p, i) { return i; }).sort(function (a, b) { return totalPts(players[b]) - totalPts(players[a]); });
        for (var r = 0; r < order.length; r++) {
            var pl = players[order[r]];
            line(3 + r, (r + 1) + '. ' + rpad(pl.name + (pl.elim ? ' (VYŘAZEN)' : ''), 20) + lpad(totalPts(pl), 5) + ' B', PCOL[order[r]], 14);
        }
        sheet(9, 0, 5);
        sheet(15, 5, 10);
        if (players.length > 1) { line(20, 'VÍTĚZ: ' + players[order[0]].name, 12); }
        line(21, newRecord ? 'NOVÝ REKORD: ' + hi : 'REKORD: ' + hi, (frame >> 3) & 1 ? 14 : 15);
        if ((frame >> 4) & 1) { line(22, 'MEZERNÍK = MENU', 15); }
    }

    function draw() {
        switch (state) {
            case 'title': drawTitle(); break;
            case 'setup': drawSetup(); break;
            case 'intro': drawIntro(); break;
            case 'table': drawTable(); break;
            case 'over': drawOver(); break;
            case 'paused':
                if (att && prevState !== 'intro') { drawPlay(); } else { drawIntro(); }
                banner('PAUZA', 'P - POKRAČOVAT', null, 15);
                break;
            default:
                drawPlay();
                if (att && att.phase === 'done' && (state === 'result' || state === 'dying')) { resultBanner(); }
                break;
        }
        scr.render(ctx);
    }

    // ---------- smyčka (logika 50 Hz) ----------
    var last = 0, acc = 0, STEP = 1000 / 50;

    function loop(ts) {
        var dt = Math.min(250, ts - last || 0);
        last = ts;
        if (state !== 'paused') {
            acc += dt;
            while (acc >= STEP) { tick(); acc -= STEP; }
        } else {
            acc = 0;
            frame++;
        }
        draw();
        requestAnimationFrame(loop);
    }

    DEC.game = {
        // pro testy
        _get: function () { return { state: state, att: att, players: players, evIdx: evIdx, cur: cur, hi: hi, costsLife: costsLife }; },
        _tick: tick, _draw: draw, _start: startGame, _press: press, _inject: function (s) { inq.push(s); },
        _setEv: function (i) { evIdx = i; }, _pause: togglePause
    };

    toTitle();
    requestAnimationFrame(loop);
})(window);
