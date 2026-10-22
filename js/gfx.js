// Obrazovka ve stylu ZX Spectrum: 256x192 bitmapa + atributy po 8x8 bodech (INK, PAPER, BRIGHT).
// Sprite přebarví INK celého políčka, na které zasahuje ("attribute clash").
(function (root) {
    'use strict';

    var DEC = root.DEC = root.DEC || {};

    var W = 256, H = 192, CW = 32, CH = 24;

    var PAL = [
        [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215], [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215],
        [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]
    ];

    function Screen() {
        this.bits = new Uint8Array(W * H);
        this.ink = new Uint8Array(CW * CH);
        this.paper = new Uint8Array(CW * CH);
        this.bright = new Uint8Array(CW * CH);
        this.imageData = null;
        this.border = 0;
    }

    Screen.prototype.clear = function (paper, ink) {
        this.bits.fill(0);
        this.ink.fill(ink === undefined ? 7 : ink);
        this.paper.fill(paper || 0);
        this.bright.fill(0);
    };

    // barva 0..15: nižší 3 bity = barva, bit 3 = jasná
    Screen.prototype.setCell = function (cx, cy, ink, paper, bright) {
        if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) { return; }
        var i = cy * CW + cx;
        this.ink[i] = ink & 7;
        this.paper[i] = paper & 7;
        this.bright[i] = bright ? 1 : 0;
    };

    Screen.prototype.fillCells = function (cx, cy, w, h, ink, paper, bright) {
        for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) { this.setCell(cx + x, cy + y, ink, paper, bright); } }
    };

    // vzor 8x8 (pole řetězců 'X'/'.') do políčka; přepíše bity, nastaví INK
    Screen.prototype.pattern = function (cx, cy, rows, ink, rowsToDraw) {
        if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) { return; }
        var i = cy * CW + cx;
        this.ink[i] = ink & 7;
        if (ink & 8) { this.bright[i] = 1; }
        var n = rowsToDraw === undefined ? 8 : rowsToDraw;
        for (var y = 0; y < 8; y++) {
            var row = rows[y] || '........';
            for (var x = 0; x < 8; x++) {
                this.bits[(cy * 8 + y) * W + cx * 8 + x] = (y < n && row.charAt(x) === 'X') ? 1 : 0;
            }
        }
    };

    // jeden blok bodů (pro text a lišty); setInk = přebarvit INK políčka
    Screen.prototype.block = function (x, y, w, h, v, ink, setInk) {
        for (var yy = y; yy < y + h; yy++) {
            if (yy < 0 || yy >= H) { continue; }
            for (var xx = x; xx < x + w; xx++) {
                if (xx < 0 || xx >= W) { continue; }
                this.bits[yy * W + xx] = v;
                if (setInk && v) {
                    var ci = (yy >> 3) * CW + (xx >> 3);
                    this.ink[ci] = ink & 7;
                    if (ink & 8) { this.bright[ci] = 1; }
                }
            }
        }
    };

    // sprite: pole řetězců; flip = zrcadlově; clash přebarví INK políček se sprite body
    Screen.prototype.sprite = function (x, y, rows, ink, flip) {
        var h = rows.length, w = rows[0].length;
        for (var r = 0; r < h; r++) {
            var yy = y + r;
            if (yy < 0 || yy >= H) { continue; }
            for (var c = 0; c < w; c++) {
                if (rows[r].charAt(flip ? w - 1 - c : c) !== 'X') { continue; }
                var xx = x + c;
                if (xx < 0 || xx >= W) { continue; }
                this.bits[yy * W + xx] = 1;
                var ci = (yy >> 3) * CW + (xx >> 3);
                this.ink[ci] = ink & 7;
                if (ink & 8) { this.bright[ci] = 1; }
            }
        }
    };

    Screen.prototype.render = function (ctx) {
        if (!this.imageData) { this.imageData = ctx.createImageData(W, H); }
        var d = this.imageData.data, bits = this.bits;
        for (var y = 0; y < H; y++) {
            var crow = (y >> 3) * CW;
            for (var x = 0; x < W; x++) {
                var ci = crow + (x >> 3);
                var b = this.bright[ci] ? 8 : 0;
                var col = PAL[(bits[y * W + x] ? this.ink[ci] : this.paper[ci]) + b];
                var o = (y * W + x) * 4;
                d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
            }
        }
        ctx.putImageData(this.imageData, 0, 0);
    };

    DEC.Screen = Screen;
    DEC.PAL = PAL;
    DEC.SW = W; DEC.SH = H;
})(typeof window !== 'undefined' ? window : globalThis);
