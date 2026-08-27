(function () {
  'use strict';

  var canvas = document.getElementById('city-canvas');
  var ctx = canvas.getContext('2d');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var scrollY = 0, mouseX = 0.5;
  var tick = 0;
  var fogTick = 0;

  // ── Layer definitions ──────────────────────────────────────────────────────
  var LAYERS = [
    {
      id: 'far',
      fill:       '#0b1520',
      winColor:   'rgba(160,210,255,0.42)',
      signColors: ['rgba(100,180,255,', 'rgba(200,240,255,'],
      baseYFrac:  0.76,
      parallaxX:  0.06,
      parallaxY:  0.02,
      buildings:  []
    },
    {
      id: 'mid',
      fill:       '#080e18',
      winColor:   'rgba(0,229,255,0.36)',
      signColors: ['rgba(0,229,255,', 'rgba(180,240,255,'],
      baseYFrac:  0.79,
      parallaxX:  0.14,
      parallaxY:  0.05,
      buildings:  []
    },
    {
      id: 'near',
      fill:       '#04080e',
      winColor:   'rgba(255,46,136,0.30)',
      signColors: ['rgba(255,46,136,', 'rgba(0,229,255,', 'rgba(255,180,50,'],
      baseYFrac:  0.83,
      parallaxX:  0.26,
      parallaxY:  0.09,
      buildings:  []
    }
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rand(lo, hi)  { return lo + Math.random() * (hi - lo); }
  function randi(lo, hi) { return Math.floor(rand(lo, hi + 1)); }

  // ── Building generator ─────────────────────────────────────────────────────
  function buildCity(layer) {
    var baseY = layer.baseYFrac * H;
    var buildings = [];
    var x = -60;

    while (x < W + 80) {
      // Supertall: ~8% chance — narrow + very tall
      var supertall = Math.random() < 0.08;
      var w = supertall ? randi(10, 26) : randi(16, 76);
      var h = supertall
        ? rand(baseY * 0.72, baseY * 0.95)
        : rand(baseY * 0.12, baseY * 0.68);
      var by = baseY - h;

      // Windows grid
      var cols = Math.max(1, Math.floor(w / 10));
      var rows = Math.max(1, Math.floor(h / 11));
      var wins = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (Math.random() > 0.30) {
            wins.push({
              rx:          c / cols,
              ry:          r / rows,
              lit:         Math.random() > 0.28,
              blinkRate:   randi(140, 900),
              blinkOffset: randi(0, 900)
            });
          }
        }
      }

      // Antenna: taller buildings almost always get one
      var antenna = null;
      if (h > baseY * 0.32 && Math.random() > (supertall ? 0.1 : 0.45)) {
        var multiSpire = supertall && Math.random() > 0.5;
        antenna = {
          ah:          rand(supertall ? 28 : 10, supertall ? 64 : 38),
          dotColor:    Math.random() > 0.5 ? '#00e5ff' : '#ff2e88',
          blinkRate:   randi(50, 110),
          blinkOffset: randi(0, 110),
          multiSpire:  multiSpire
        };
      }

      // Billboard sign on facade
      var sign = null;
      if (w > 22 && Math.random() > 0.50) {
        var sc = layer.signColors[randi(0, layer.signColors.length - 1)];
        var signH = randi(10, Math.min(22, Math.floor(h * 0.18)));
        var signW = randi(Math.floor(w * 0.45), Math.floor(w * 0.88));
        sign = {
          relY:        rand(0.18, 0.72),
          w:           signW,
          h:           signH,
          color:       sc,
          alpha:       rand(0.45, 0.72),
          blink:       Math.random() > 0.82,
          blinkRate:   randi(28, 80),
          blinkOffset: randi(0, 200)
        };
      }

      // Vertical edge neon strip: wide buildings only
      var edgeStrip = null;
      if (w > 44 && Math.random() > 0.62) {
        edgeStrip = {
          side:  Math.random() > 0.5 ? 'left' : 'right',
          color: Math.random() > 0.5 ? 'rgba(0,229,255,' : 'rgba(255,46,136,',
          alpha: rand(0.25, 0.48),
          yFrac: rand(0.18, 0.42), // start position on facade
          hFrac: rand(0.30, 0.56)  // fraction of h covered
        };
      }

      // Rooftop clutter on wide buildings
      var rooftop = [];
      if (w > 38 && Math.random() > 0.55) {
        var nClutter = randi(1, 3);
        for (var ci = 0; ci < nClutter; ci++) {
          rooftop.push({
            rx: rand(0.1, 0.85),
            rw: rand(4, 10),
            rh: rand(4, 14)
          });
        }
      }

      buildings.push({ x: x, w: w, h: h, wins: wins, antenna: antenna,
                       sign: sign, edgeStrip: edgeStrip, rooftop: rooftop });

      x += w + randi(0, 6);
    }

    layer.buildings = buildings;
  }

  // ── Rain ───────────────────────────────────────────────────────────────────
  var RAIN_COUNT  = 220;
  var RAIN_ANGLE  = Math.PI / 2 + 0.18;
  var RAIN_SPEED  = 14;
  var rain = [];

  function newDrop(scatter) {
    var speed = rand(0.65, 1.5) * RAIN_SPEED;
    return {
      x:     rand(0, W),
      y:     scatter ? rand(-H, H) : rand(-90, -6),
      len:   rand(9, 26),
      lw:    rand(0.5, 1.1),
      speed: speed,
      dx:    Math.cos(RAIN_ANGLE) * speed,
      dy:    Math.sin(RAIN_ANGLE) * speed,
      alpha: rand(0.10, 0.36)
    };
  }

  function initRain() {
    rain = [];
    for (var i = 0; i < RAIN_COUNT; i++) rain.push(newDrop(true));
  }

  // ── Fog ────────────────────────────────────────────────────────────────────
  var FOG = [
    { xFrac: 0.12, yFrac: 0.70, rx: 0.38, ry: 0.13, driftX: 0.00004, alpha: 0.24 },
    { xFrac: 0.58, yFrac: 0.66, rx: 0.30, ry: 0.11, driftX: 0.00006, alpha: 0.20 },
    { xFrac: 0.84, yFrac: 0.74, rx: 0.24, ry: 0.09, driftX: 0.00003, alpha: 0.16 }
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

  // ── Atmosphere (behind all layers) ─────────────────────────────────────────
  function drawAtmosphere() {
    var midH = LAYERS[1].baseYFrac * H;

    // City light pollution — large cyan-tinted glow at horizon
    var cityGlow = ctx.createRadialGradient(W * 0.5, midH * 1.15, 0, W * 0.5, midH * 0.85, W * 0.92);
    cityGlow.addColorStop(0,    'rgba(0,45,70,0.50)');
    cityGlow.addColorStop(0.30, 'rgba(0,22,42,0.22)');
    cityGlow.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, 0, W, H);

    // Secondary magenta bloom off-center
    var mg = ctx.createRadialGradient(W * 0.74, midH * 1.08, 0, W * 0.74, midH * 0.96, W * 0.44);
    mg.addColorStop(0,   'rgba(55,0,28,0.20)');
    mg.addColorStop(0.5, 'rgba(28,0,14,0.08)');
    mg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Draw one city layer ────────────────────────────────────────────────────
  function drawLayer(layer) {
    var px    = (mouseX - 0.5) * layer.parallaxX * W;
    var py    = scrollY * layer.parallaxY;
    var baseY = layer.baseYFrac * H + py;

    ctx.save();
    ctx.translate(px, 0);

    layer.buildings.forEach(function (b) {
      var bx = b.x;
      var by = baseY - b.h;

      // ── Silhouette ────────────────────────────────────────────────────────
      ctx.fillStyle = layer.fill;
      ctx.fillRect(bx, by, b.w, b.h + 4);

      // ── Rooftop clutter ───────────────────────────────────────────────────
      b.rooftop.forEach(function (c) {
        ctx.fillStyle = layer.fill;
        ctx.fillRect(bx + c.rx * b.w, by - c.rh, c.rw, c.rh);
      });

      // ── Windows ───────────────────────────────────────────────────────────
      var padX   = Math.max(3, b.w * 0.10);
      var padY   = 8;
      var innerW = b.w - padX * 2;
      var innerH = b.h - padY * 2;
      var ww     = Math.max(2, innerW / Math.max(1, b.wins.length > 8 ? 4 : 3) - 2);

      b.wins.forEach(function (win) {
        var blink = Math.floor((tick + win.blinkOffset) / win.blinkRate) % 2 === 0;
        if (!win.lit || !blink) return;
        ctx.fillStyle = layer.winColor;
        ctx.fillRect(
          bx + padX + win.rx * innerW,
          by + padY + win.ry * innerH,
          ww, 7
        );
      });

      // ── Vertical edge neon strip ──────────────────────────────────────────
      if (b.edgeStrip) {
        var es   = b.edgeStrip;
        var ex   = es.side === 'left' ? bx : bx + b.w - 2;
        var ey   = by + es.yFrac * b.h;
        var eh   = es.hFrac * b.h;
        var ealpha = es.alpha;
        ctx.fillStyle = es.color + ealpha + ')';
        ctx.fillRect(ex, ey, 2, eh);
        // soft glow
        var egrad = ctx.createLinearGradient(ex - 6, 0, ex + 8, 0);
        egrad.addColorStop(0,   es.color + '0)');
        egrad.addColorStop(0.4, es.color + (ealpha * 0.30) + ')');
        egrad.addColorStop(1,   es.color + '0)');
        ctx.fillStyle = egrad;
        ctx.fillRect(ex - 6, ey, 14, eh);
      }

      // ── Billboard sign ────────────────────────────────────────────────────
      if (b.sign) {
        var sg    = b.sign;
        var alpha = sg.alpha;
        if (sg.blink) {
          alpha *= Math.floor((tick + sg.blinkOffset) / sg.blinkRate) % 2 === 0 ? 1 : 0;
        }
        if (alpha > 0) {
          var sx = bx + (b.w - sg.w) / 2;
          var sy = by + sg.relY * b.h;
          ctx.fillStyle = sg.color + alpha + ')';
          ctx.fillRect(sx, sy, sg.w, sg.h);
          // glow halo
          var sgrad = ctx.createRadialGradient(
            sx + sg.w / 2, sy + sg.h / 2, 0,
            sx + sg.w / 2, sy + sg.h / 2, sg.w * 0.8
          );
          sgrad.addColorStop(0,   sg.color + (alpha * 0.28) + ')');
          sgrad.addColorStop(1,   sg.color + '0)');
          ctx.fillStyle = sgrad;
          ctx.fillRect(sx - sg.w * 0.4, sy - sg.h * 0.6, sg.w * 1.8, sg.h * 2.2);
        }
      }

      // ── Antenna ───────────────────────────────────────────────────────────
      if (b.antenna) {
        var ant = b.antenna;
        var ax  = bx + b.w / 2;
        var ay  = by;
        ctx.strokeStyle = 'rgba(90,120,150,0.55)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax, ay - ant.ah);
        ctx.stroke();

        if (ant.multiSpire) {
          ctx.beginPath();
          ctx.moveTo(ax - 4, ay);
          ctx.lineTo(ax - 4, ay - ant.ah * 0.55);
          ctx.moveTo(ax + 4, ay);
          ctx.lineTo(ax + 4, ay - ant.ah * 0.55);
          ctx.stroke();
        }

        var dotOn = Math.floor((tick + ant.blinkOffset) / ant.blinkRate) % 2 === 0;
        if (dotOn) {
          // glow ring
          ctx.shadowBlur  = 6;
          ctx.shadowColor = ant.dotColor;
          ctx.fillStyle   = ant.dotColor;
          ctx.beginPath();
          ctx.arc(ax, ay - ant.ah, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    });

    // ── Per-layer horizon glow ─────────────────────────────────────────────
    var hColor = layer.id === 'near'
      ? 'rgba(255,46,136,0.06)'
      : 'rgba(0,229,255,0.055)';
    var glowGrad = ctx.createLinearGradient(0, baseY - 20, 0, baseY + 16);
    glowGrad.addColorStop(0, hColor);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-W * 0.5, baseY - 20, W * 2, 36);

    // ── Power cables (near layer only) ────────────────────────────────────
    if (layer.id === 'near') {
      ctx.strokeStyle = 'rgba(70,95,115,0.28)';
      ctx.lineWidth   = 0.8;
      var bs = layer.buildings;
      for (var j = 0; j < bs.length - 3; j += randi(2, 4)) {
        var b1 = bs[j];
        var b2 = bs[j + randi(2, 3)];
        if (!b2 || b1.h < baseY * 0.28 || b2.h < baseY * 0.28) continue;
        var x1  = b1.x + b1.w * 0.7;
        var y1  = baseY - b1.h * 0.88;
        var x2  = b2.x + b2.w * 0.3;
        var y2  = baseY - b2.h * 0.88;
        var sag = Math.max(y1, y2) + rand(8, 22);
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
      ctx.strokeStyle = 'rgba(140,210,255,1)';
      ctx.lineWidth   = d.lw;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(
        d.x + Math.cos(RAIN_ANGLE) * d.len,
        d.y + Math.sin(RAIN_ANGLE) * d.len
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Fog ────────────────────────────────────────────────────────────────────
  function drawFog() {
    fogTick += 0.28;
    FOG.forEach(function (f, i) {
      var cx = (f.xFrac + Math.sin(fogTick * f.driftX * 1000 + i) * 0.09 +
                (mouseX - 0.5) * 0.045) * W;
      var cy = f.yFrac * H;
      var rx = f.rx * W;
      var ry = f.ry * H;

      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0,   'rgba(0,22,44,' + f.alpha + ')');
      grad.addColorStop(0.5, 'rgba(0,10,22,' + (f.alpha * 0.5) + ')');
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
    var nearBaseY = LAYERS[2].baseYFrac * H + scrollY * LAYERS[2].parallaxY;
    ctx.fillStyle = '#020405';
    ctx.fillRect(0, nearBaseY, W, H - nearBaseY + 2);

    // Ground-level cyan ambient glow
    var gfog = ctx.createLinearGradient(0, nearBaseY, 0, nearBaseY + 72);
    gfog.addColorStop(0, 'rgba(0,229,255,0.045)');
    gfog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gfog;
    ctx.fillRect(0, nearBaseY, W, 72);

    // Wet ground reflection — thin band
    var refl = ctx.createLinearGradient(0, nearBaseY, 0, nearBaseY + 18);
    refl.addColorStop(0, 'rgba(0,229,255,0.06)');
    refl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl;
    ctx.fillRect(0, nearBaseY, W, 18);
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function draw() {
    // Sky
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,   '#06080c');
    sky.addColorStop(0.5, '#070c12');
    sky.addColorStop(1,   '#09101e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawAtmosphere();
    drawLayer(LAYERS[0]);
    drawLayer(LAYERS[1]);
    if (!reduced) drawFog();
    drawLayer(LAYERS[2]);
    drawGround();
    if (!reduced) drawRain();
  }

  function updateRain() {
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      d.x += d.dx;
      d.y += d.dy;
      if (d.y > H + 24 || d.x > W + 24) rain[i] = newDrop(false);
    }
  }

  // ── RAF ────────────────────────────────────────────────────────────────────
  function loop() {
    tick++;
    if (!reduced) updateRain();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  window.addEventListener('scroll',    function () { scrollY = window.scrollY; }, { passive: true });
  window.addEventListener('mousemove', function (e) { mouseX = e.clientX / window.innerWidth; }, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  resize();
  reduced ? draw() : requestAnimationFrame(loop);

})();
