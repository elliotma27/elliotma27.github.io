(function () {
  'use strict';

  var canvas = document.getElementById('city-canvas');
  var ctx    = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var scrollY = 0, mouseX = 0.5;
  var tick = 0, fogTick = 0;

  // ── Layers (near → far order reversed for draw) ────────────────────────────
  // Extra "haze" layer added as the furthest backdrop
  var LAYERS = [
    {
      id: 'haze',
      fill:        '#0a1520',
      winColor:    'rgba(180,220,255,0.22)',
      signColors:  ['rgba(140,200,255,'],
      baseYFrac:   0.68,
      parallaxX:   0.02,
      parallaxY:   0.008,
      floorAlpha:  0.07,
      winType:     'band',   // all haze buildings use band windows
      buildings:   []
    },
    {
      id: 'far',
      fill:        '#0b1622',
      winColor:    'rgba(170,215,255,0.40)',
      signColors:  ['rgba(120,190,255,', 'rgba(200,240,255,'],
      baseYFrac:   0.74,
      parallaxX:   0.05,
      parallaxY:   0.018,
      floorAlpha:  0.10,
      winType:     'mixed',
      buildings:   []
    },
    {
      id: 'mid',
      fill:        '#080e18',
      winColor:    'rgba(0,229,255,0.38)',
      signColors:  ['rgba(0,229,255,', 'rgba(190,240,255,', 'rgba(255,200,80,'],
      baseYFrac:   0.78,
      parallaxX:   0.13,
      parallaxY:   0.045,
      floorAlpha:  0.13,
      winType:     'mixed',
      buildings:   []
    },
    {
      id: 'near',
      fill:        '#04070d',
      winColor:    'rgba(255,60,140,0.32)',
      signColors:  ['rgba(255,46,136,', 'rgba(0,229,255,', 'rgba(255,180,40,', 'rgba(255,255,255,'],
      baseYFrac:   0.85,
      parallaxX:   0.24,
      parallaxY:   0.08,
      floorAlpha:  0.16,
      winType:     'grid',
      buildings:   []
    }
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rand(lo, hi)  { return lo + Math.random() * (hi - lo); }
  function randi(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
  function pick(arr)     { return arr[randi(0, arr.length - 1)]; }

  // ── Japanese sign pool ─────────────────────────────────────────────────────
  var JP_SIGNS = [
    // Single kanji — landmark feel
    '光', '夜', '食', '酒', '店', '東', '金', '熱', '風', '水', '火', '南', '楽', '夢',
    // Katakana words
    'ホテル', 'バー', 'クラブ', 'カラオケ', 'ラーメン', 'パチンコ', 'ゲーム', 'ナイト',
    // Short phrase signs
    '営業中', '深夜', '居酒屋', '焼肉', '食堂', '薬局', '銀行', '両替',
    // Place names
    '新宿', '銀座', '渋谷', '東京', '六本木',
    // Numbers / time
    '24時間', '深夜営業'
  ];
  var JP_COLORS = [
    'rgba(0,229,255,',   // cyan
    'rgba(255,46,136,',  // magenta
    'rgba(255,200,65,',  // amber
    'rgba(200,255,200,'  // pale green (rare feel)
  ];

  // ── Building generator ─────────────────────────────────────────────────────
  function buildCity(layer) {
    var baseY = layer.baseYFrac * H;
    var buildings = [];
    var x = -80;
    var isHaze = layer.id === 'haze';
    var isNear = layer.id === 'near';

    while (x < W + 100) {
      // Supertall: more common on far/mid layers for drama
      var supertall = !isHaze && Math.random() < (isNear ? 0.10 : 0.15);
      var w = supertall ? randi(8, 22) : randi(14, isNear ? 68 : 80);
      var maxH = supertall ? baseY * 0.96 : baseY * (isHaze ? 0.72 : 0.76);
      var minH = baseY * (isHaze ? 0.30 : 0.10);
      var h = rand(minH, maxH);

      // Setback profile: 28% of non-supertall, non-haze buildings
      var setback = null;
      if (!supertall && !isHaze && w > 28 && Math.random() < 0.28) {
        var sw  = rand(w * 0.45, w * 0.72);
        var sh  = rand(h * 0.20, h * 0.45);
        var sox = rand(0, w - sw);
        setback = { w: sw, h: sh, ox: sox };
      }

      // Window type per building
      var wType = layer.winType;
      if (wType === 'mixed') {
        var r = Math.random();
        wType = r < 0.40 ? 'grid' : r < 0.72 ? 'band' : 'dark-base';
      }

      // Pre-compute floor count for band windows
      var floorH   = randi(9, 14);
      var numFloors = Math.max(2, Math.floor(h / floorH));

      // Window grid (type: grid / dark-base)
      var wins = [];
      if (wType === 'grid' || wType === 'dark-base') {
        var cols = Math.max(1, Math.floor(w / 9));
        var rows = Math.max(1, Math.floor(h / 11));
        var darkBase = wType === 'dark-base' ? Math.floor(rows * rand(0.35, 0.60)) : 0;
        for (var r2 = 0; r2 < rows; r2++) {
          for (var c = 0; c < cols; c++) {
            if (r2 < darkBase) continue;
            if (Math.random() > 0.28) {
              wins.push({
                rx:          c / cols,
                ry:          r2 / rows,
                lit:         Math.random() > 0.26,
                blinkRate:   randi(100, 1100),
                blinkOffset: randi(0, 1100),
                type:        'px'
              });
            }
          }
        }
      }

      // Band windows (horizontal lit floors)
      var bands = [];
      if (wType === 'band') {
        for (var f = 0; f < numFloors; f++) {
          if (Math.random() > 0.38) {
            bands.push({
              fy:          f / numFloors,
              lit:         Math.random() > 0.30,
              blinkRate:   randi(200, 1400),
              blinkOffset: randi(0, 1400),
              alpha:       rand(0.28, 0.50)
            });
          }
        }
      }

      // Antenna
      var antenna = null;
      if (h > baseY * 0.28 && Math.random() > (supertall ? 0.08 : 0.50)) {
        antenna = {
          ah:          rand(supertall ? 30 : 8, supertall ? 80 : 40),
          dotColor:    Math.random() > 0.5 ? '#00e5ff' : '#ff2e88',
          blinkRate:   randi(40, 110),
          blinkOffset: randi(0, 110),
          arms:        supertall && Math.random() > 0.4,
          armW:        rand(6, 14)
        };
      }

      // Billboard sign — larger and more prominent than before
      var sign = null;
      if (!isHaze && w > 18 && Math.random() > 0.44) {
        var sc   = pick(layer.signColors);
        var maxSW = Math.floor(w * (isNear ? 0.96 : 0.88));
        var signW = randi(Math.floor(w * 0.50), maxSW);
        var signH = randi(isNear ? 14 : 10, isNear ? 32 : 24);
        sign = {
          relY:        rand(0.12, 0.68),
          w:           signW,
          h:           signH,
          color:       sc,
          alpha:       rand(0.50, 0.80),
          blink:       Math.random() > 0.78,
          blinkRate:   randi(22, 72),
          blinkOffset: randi(0, 300),
          hasText:     isNear && Math.random() > 0.55
        };
      }

      // Vertical edge neon strip
      var edgeStrip = null;
      if (!isHaze && w > 36 && Math.random() > 0.58) {
        edgeStrip = {
          side:  Math.random() > 0.5 ? 'left' : 'right',
          color: Math.random() > 0.45 ? 'rgba(0,229,255,' : 'rgba(255,46,136,',
          alpha: rand(0.22, 0.52),
          yFrac: rand(0.12, 0.32),
          hFrac: rand(0.38, 0.72)
        };
      }

      // Japanese text sign on facade
      var textSign = null;
      var jpChance = isNear ? 0.28 : layer.id === 'mid' ? 0.16 : layer.id === 'far' ? 0.08 : 0;
      if (jpChance > 0 && h > baseY * 0.20 && Math.random() < jpChance) {
        var jpTxt   = pick(JP_SIGNS);
        var jpColor = pick(JP_COLORS);
        var jpSize  = isNear ? randi(10, 16) : layer.id === 'mid' ? randi(7, 11) : randi(5, 8);
        textSign = {
          txt:         jpTxt,
          color:       jpColor,
          alpha:       rand(0.55, 0.88),
          size:        jpSize,
          relX:        rand(0.05, Math.max(0.06, 1 - (jpSize + 6) / w)),
          relY:        rand(0.12, 0.52),
          blink:       Math.random() > 0.75,
          blinkRate:   randi(35, 110),
          blinkOffset: randi(0, 400),
          hasBox:      Math.random() > 0.45
        };
      }

      buildings.push({
        x: x, w: w, h: h,
        floorH: floorH, numFloors: numFloors,
        wins: wins, bands: bands,
        antenna: antenna, sign: sign,
        edgeStrip: edgeStrip, setback: setback,
        textSign: textSign,
        wType: wType
      });

      // Zero or tiny gaps — dense city packing
      x += w + randi(0, isNear ? 3 : 2);
    }

    layer.buildings = buildings;
  }

  // ── Rain ───────────────────────────────────────────────────────────────────
  var RAIN_COUNT = 240;
  var RAIN_ANGLE = Math.PI / 2 + 0.20;
  var RAIN_SPEED = 15;
  var rain = [];

  function newDrop(scatter) {
    var speed = rand(0.65, 1.6) * RAIN_SPEED;
    return {
      x:     rand(0, W),
      y:     scatter ? rand(-H, H) : rand(-100, -8),
      len:   rand(10, 30),
      lw:    rand(0.45, 1.1),
      dx:    Math.cos(RAIN_ANGLE) * speed,
      dy:    Math.sin(RAIN_ANGLE) * speed,
      alpha: rand(0.08, 0.32)
    };
  }

  function initRain() {
    rain = [];
    for (var i = 0; i < RAIN_COUNT; i++) rain.push(newDrop(true));
  }

  // ── Fog ────────────────────────────────────────────────────────────────────
  var FOG = [
    { xFrac: 0.10, yFrac: 0.68, rx: 0.42, ry: 0.14, driftX: 0.000035, alpha: 0.26 },
    { xFrac: 0.55, yFrac: 0.64, rx: 0.32, ry: 0.11, driftX: 0.000055, alpha: 0.20 },
    { xFrac: 0.82, yFrac: 0.72, rx: 0.26, ry: 0.10, driftX: 0.000028, alpha: 0.17 }
  ];

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LAYERS.forEach(buildCity);
    if (!reduced) initRain();
  }

  // ── Atmosphere ─────────────────────────────────────────────────────────────
  function drawAtmosphere() {
    var midH = LAYERS[2].baseYFrac * H; // mid layer horizon

    // City light pollution
    var g1 = ctx.createRadialGradient(W * 0.50, midH * 1.20, 0, W * 0.50, midH * 0.82, W * 1.0);
    g1.addColorStop(0,    'rgba(0,48,75,0.55)');
    g1.addColorStop(0.28, 'rgba(0,24,44,0.24)');
    g1.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    // Off-center magenta bloom
    var g2 = ctx.createRadialGradient(W * 0.76, midH * 1.10, 0, W * 0.76, midH, W * 0.46);
    g2.addColorStop(0,   'rgba(60,0,32,0.22)');
    g2.addColorStop(0.5, 'rgba(30,0,16,0.09)');
    g2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    // Distant haze band across the horizon
    var hazeY = LAYERS[0].baseYFrac * H;
    var g3 = ctx.createLinearGradient(0, hazeY - 60, 0, hazeY + 30);
    g3.addColorStop(0,   'rgba(0,30,55,0)');
    g3.addColorStop(0.5, 'rgba(0,30,55,0.28)');
    g3.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, hazeY - 60, W, 90);
  }

  // ── Draw one layer ─────────────────────────────────────────────────────────
  function drawLayer(layer) {
    var px    = (mouseX - 0.5) * layer.parallaxX * W;
    var py    = scrollY * layer.parallaxY;
    var baseY = layer.baseYFrac * H + py;
    var isNear = layer.id === 'near';

    ctx.save();
    ctx.translate(px, 0);

    layer.buildings.forEach(function (b) {
      var bx = b.x;
      var by = baseY - b.h;

      // ── Main silhouette ──────────────────────────────────────────────────
      ctx.fillStyle = layer.fill;
      ctx.fillRect(bx, by, b.w, b.h + 2);

      // ── Setback upper tier ───────────────────────────────────────────────
      if (b.setback) {
        var sb = b.setback;
        ctx.fillRect(bx + sb.ox, by - sb.h, sb.w, sb.h);
      }

      // ── Floor plate lines ────────────────────────────────────────────────
      if (layer.floorAlpha > 0) {
        ctx.strokeStyle = 'rgba(160,200,230,' + layer.floorAlpha + ')';
        ctx.lineWidth   = 0.8;
        for (var fl = 0; fl < b.numFloors; fl++) {
          var fy = by + (fl / b.numFloors) * b.h;
          ctx.beginPath();
          ctx.moveTo(bx, fy);
          ctx.lineTo(bx + b.w, fy);
          ctx.stroke();
        }
      }

      // ── Windows: pixel grid ──────────────────────────────────────────────
      if (b.wType === 'grid' || b.wType === 'dark-base') {
        var padX   = Math.max(2, b.w * 0.09);
        var padY   = 6;
        var innerW = b.w - padX * 2;
        var innerH = b.h - padY * 2;
        var ncols  = Math.max(1, Math.floor(b.w / 9));
        var ww     = Math.max(2, innerW / ncols - 1.5);

        b.wins.forEach(function (win) {
          var blink = Math.floor((tick + win.blinkOffset) / win.blinkRate) % 2 === 0;
          if (!win.lit || !blink) return;
          ctx.fillStyle = layer.winColor;
          ctx.fillRect(
            bx + padX + win.rx * innerW,
            by + padY + win.ry * innerH,
            ww, 6
          );
        });
      }

      // ── Windows: horizontal bands (whole floor lit) ──────────────────────
      if (b.wType === 'band') {
        b.bands.forEach(function (band) {
          var blink = Math.floor((tick + band.blinkOffset) / band.blinkRate) % 2 === 0;
          if (!band.lit || !blink) return;
          var wy     = by + band.fy * b.h;
          var bandH  = (b.h / b.numFloors) * 0.55;
          ctx.fillStyle = layer.winColor.replace(')', '').replace('rgba', 'rgba') +
                          (typeof layer.winColor === 'string'
                            ? '' // already has alpha in winColor
                            : '');
          // Rebuild with custom alpha
          var base = layer.winColor; // e.g. 'rgba(170,215,255,0.40)'
          // Re-parse to apply band alpha multiplier
          ctx.globalAlpha = band.alpha;
          ctx.fillStyle   = base;
          ctx.fillRect(bx + 2, wy, b.w - 4, bandH);
          ctx.globalAlpha = 1;
        });
      }

      // ── Vertical edge neon strip ─────────────────────────────────────────
      if (b.edgeStrip) {
        var es  = b.edgeStrip;
        var ex  = es.side === 'left' ? bx : bx + b.w - 2;
        var ey  = by + es.yFrac * b.h;
        var eh  = es.hFrac * b.h;
        ctx.fillStyle = es.color + es.alpha + ')';
        ctx.fillRect(ex, ey, 2, eh);
        var eg = ctx.createLinearGradient(ex - 8, 0, ex + 10, 0);
        eg.addColorStop(0,   es.color + '0)');
        eg.addColorStop(0.45, es.color + (es.alpha * 0.28) + ')');
        eg.addColorStop(1,   es.color + '0)');
        ctx.fillStyle = eg;
        ctx.fillRect(ex - 8, ey, 18, eh);
      }

      // ── Billboard sign ───────────────────────────────────────────────────
      if (b.sign) {
        var sg    = b.sign;
        var alpha = sg.alpha;
        if (sg.blink && Math.floor((tick + sg.blinkOffset) / sg.blinkRate) % 2 !== 0) alpha = 0;
        if (alpha > 0) {
          var sx = bx + (b.w - sg.w) / 2;
          var sy = by + sg.relY * b.h;

          // Main sign rect
          ctx.fillStyle = sg.color + alpha + ')';
          ctx.fillRect(sx, sy, sg.w, sg.h);

          // Inner highlight line (top edge — simulates LED edge brightness)
          ctx.fillStyle = sg.color + Math.min(1, alpha + 0.25) + ')';
          ctx.fillRect(sx, sy, sg.w, 2);

          // Glow halo
          var srad = ctx.createRadialGradient(
            sx + sg.w / 2, sy + sg.h / 2, 0,
            sx + sg.w / 2, sy + sg.h / 2, sg.w * 0.9
          );
          srad.addColorStop(0, sg.color + (alpha * 0.30) + ')');
          srad.addColorStop(1, sg.color + '0)');
          ctx.fillStyle = srad;
          ctx.fillRect(sx - sg.w * 0.5, sy - sg.h, sg.w * 2, sg.h * 3);
        }
      }

      // ── Japanese text sign ───────────────────────────────────────────────
      if (b.textSign) {
        var ts    = b.textSign;
        var talpha = ts.alpha;
        if (ts.blink && Math.floor((tick + ts.blinkOffset) / ts.blinkRate) % 2 !== 0) talpha = 0;

        if (talpha > 0) {
          var chars  = ts.txt.split('');
          var charH  = ts.size + 2;
          var textH  = chars.length * charH;
          var tx     = bx + ts.relX * b.w;
          var ty     = by + ts.relY * b.h;

          // Clamp inside building bounds
          if (ty + textH > baseY - 4) ty = baseY - textH - 6;
          if (tx + ts.size > bx + b.w - 1) tx = bx + b.w - ts.size - 2;

          ctx.save();

          // Optional panel box
          if (ts.hasBox) {
            ctx.strokeStyle = ts.color + (talpha * 0.65) + ')';
            ctx.lineWidth   = 0.8;
            ctx.strokeRect(tx - 2, ty - 2, ts.size + 4, textH + 4);
            ctx.fillStyle = ts.color + (talpha * 0.07) + ')';
            ctx.fillRect(tx - 2, ty - 2, ts.size + 4, textH + 4);
          }

          // Glow + text
          ctx.shadowBlur  = 6;
          ctx.shadowColor = ts.color + '0.85)';
          ctx.fillStyle   = ts.color + talpha + ')';
          ctx.font        = ts.size + 'px sans-serif';
          ctx.textBaseline = 'top';

          chars.forEach(function (ch, ci) {
            ctx.fillText(ch, tx, ty + ci * charH);
          });

          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      // ── Antenna ──────────────────────────────────────────────────────────
      if (b.antenna) {
        var ant = b.antenna;
        var ax  = bx + b.w / 2;
        var ay  = by;
        if (b.setback) ay = by - b.setback.h;

        ctx.strokeStyle = 'rgba(85,115,145,0.58)';
        ctx.lineWidth   = 0.9;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax, ay - ant.ah);
        ctx.stroke();

        if (ant.arms) {
          ctx.beginPath();
          ctx.moveTo(ax - ant.armW, ay - ant.ah * 0.42);
          ctx.lineTo(ax + ant.armW, ay - ant.ah * 0.42);
          ctx.moveTo(ax - ant.armW * 0.6, ay - ant.ah * 0.68);
          ctx.lineTo(ax + ant.armW * 0.6, ay - ant.ah * 0.68);
          ctx.stroke();
        }

        var dotOn = Math.floor((tick + ant.blinkOffset) / ant.blinkRate) % 2 === 0;
        if (dotOn) {
          ctx.shadowBlur  = 8;
          ctx.shadowColor = ant.dotColor;
          ctx.fillStyle   = ant.dotColor;
          ctx.beginPath();
          ctx.arc(ax, ay - ant.ah, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    });

    // ── Horizon glow ────────────────────────────────────────────────────────
    var hc = layer.id === 'near' ? 'rgba(255,46,136,0.07)' : 'rgba(0,229,255,0.06)';
    var hg = ctx.createLinearGradient(0, baseY - 24, 0, baseY + 20);
    hg.addColorStop(0, hc);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(-W * 0.5, baseY - 24, W * 2, 44);

    // ── Power cables (near layer) ────────────────────────────────────────
    if (isNear) {
      ctx.strokeStyle = 'rgba(65,90,110,0.30)';
      ctx.lineWidth   = 0.75;
      var bs = layer.buildings;
      for (var j = 0; j < bs.length - 3; j += randi(2, 4)) {
        var b1 = bs[j];
        var b2 = bs[j + randi(2, 4)];
        if (!b2 || b1.h < baseY * 0.24 || b2.h < baseY * 0.24) continue;
        var x1  = b1.x + b1.w * 0.72;
        var y1  = baseY - b1.h * 0.90;
        var x2  = b2.x + b2.w * 0.28;
        var y2  = baseY - b2.h * 0.90;
        var sag = Math.max(y1, y2) + rand(6, 24);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2, sag, x2, y2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ── Rain ───────────────────────────────────────────────────────────────────
  function drawRain() {
    ctx.save();
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      ctx.globalAlpha = d.alpha;
      ctx.strokeStyle = 'rgba(150,215,255,1)';
      ctx.lineWidth   = d.lw;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(RAIN_ANGLE) * d.len,
                 d.y + Math.sin(RAIN_ANGLE) * d.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Fog ────────────────────────────────────────────────────────────────────
  function drawFog() {
    fogTick += 0.26;
    FOG.forEach(function (f, i) {
      var cx = (f.xFrac + Math.sin(fogTick * f.driftX * 1000 + i) * 0.09 +
                (mouseX - 0.5) * 0.04) * W;
      var cy = f.yFrac * H;
      var rx = f.rx * W;
      var ry = f.ry * H;

      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0,   'rgba(0,24,46,' + f.alpha + ')');
      grad.addColorStop(0.5, 'rgba(0,12,24,' + (f.alpha * 0.48) + ')');
      grad.addColorStop(1,   'rgba(0,0,0,0)');

      ctx.save();
      ctx.scale(1, ry / rx);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy * (rx / ry), rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Ground ─────────────────────────────────────────────────────────────────
  function drawGround() {
    var nearBaseY = LAYERS[3].baseYFrac * H + scrollY * LAYERS[3].parallaxY;
    ctx.fillStyle = '#020404';
    ctx.fillRect(0, nearBaseY, W, H - nearBaseY + 2);

    // Wet-street cyan ambient
    var gfog = ctx.createLinearGradient(0, nearBaseY, 0, nearBaseY + 80);
    gfog.addColorStop(0, 'rgba(0,229,255,0.05)');
    gfog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gfog;
    ctx.fillRect(0, nearBaseY, W, 80);

    // Reflection strip
    var refl = ctx.createLinearGradient(0, nearBaseY, 0, nearBaseY + 22);
    refl.addColorStop(0, 'rgba(0,229,255,0.07)');
    refl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl;
    ctx.fillRect(0, nearBaseY, W, 22);
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function draw() {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,   '#050709');
    sky.addColorStop(0.6, '#060b10');
    sky.addColorStop(1,   '#080e1c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawAtmosphere();
    // Draw layers back to front: haze → far → mid → near
    for (var i = 0; i < LAYERS.length; i++) {
      drawLayer(LAYERS[i]);
      // Fog sits between mid and near
      if (!reduced && LAYERS[i].id === 'mid') drawFog();
    }
    drawGround();
    if (!reduced) drawRain();
  }

  function updateRain() {
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      d.x += d.dx;
      d.y += d.dy;
      if (d.y > H + 28 || d.x > W + 28) rain[i] = newDrop(false);
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop() {
    tick++;
    if (!reduced) updateRain();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  window.addEventListener('scroll',    function () { scrollY = window.scrollY; }, { passive: true });
  window.addEventListener('mousemove', function (e) { mouseX = e.clientX / window.innerWidth; }, { passive: true });

  var rsz;
  window.addEventListener('resize', function () {
    clearTimeout(rsz);
    rsz = setTimeout(resize, 120);
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  resize();
  reduced ? draw() : requestAnimationFrame(loop);

})();
