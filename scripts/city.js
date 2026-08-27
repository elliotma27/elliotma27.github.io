(function () {
  'use strict';

  var canvas = document.getElementById('city-canvas');
  var ctx = canvas.getContext('2d');

  // Respect prefers-reduced-motion
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var scrollY = 0, mouseX = 0.5; // mouseX: 0–1 normalized
  var tick = 0;
  var fogTick = 0;

  // ── Layer definitions ──────────────────────────────────────────────────────
  var LAYERS = [
    {
      id: 'far',
      fill:     '#0c1824',
      winColor: 'rgba(160,210,255,0.38)',
      baseYFrac: 0.78,
      pxFactor:  0.012,
      parallaxX: 0.06,
      parallaxY: 0.02,
      buildings: []
    },
    {
      id: 'mid',
      fill:     '#080f1a',
      winColor: 'rgba(0,229,255,0.32)',
      baseYFrac: 0.80,
      pxFactor:  0.028,
      parallaxX: 0.14,
      parallaxY: 0.05,
      buildings: []
    },
    {
      id: 'near',
      fill:     '#05090f',
      winColor: 'rgba(255,46,136,0.28)',
      baseYFrac: 0.82,
      pxFactor:  0.052,
      parallaxX: 0.26,
      parallaxY: 0.09,
      buildings: []
    }
  ];

  // ── Building generator ─────────────────────────────────────────────────────
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function randi(lo, hi) { return Math.floor(rand(lo, hi + 1)); }

  function buildCity(layer) {
    var baseY = layer.baseYFrac * H;
    var buildings = [];
    var x = -40;

    while (x < W + 60) {
      var w = randi(18, 72);
      var h = rand(baseY * 0.15, baseY * 0.70);
      var y = baseY - h;

      // Windows grid
      var cols = Math.max(1, Math.floor(w / 10));
      var rows = Math.max(1, Math.floor(h / 12));
      var wins = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (Math.random() > 0.35) {
            wins.push({
              rx: c / cols,
              ry: r / rows,
              lit: Math.random() > 0.30,
              blinkRate: randi(180, 800),
              blinkOffset: randi(0, 800)
            });
          }
        }
      }

      // Antenna on taller buildings
      var antenna = null;
      if (h > baseY * 0.38 && Math.random() > 0.45) {
        antenna = {
          ah: rand(12, 36),
          dotColor: Math.random() > 0.5 ? '#00e5ff' : '#ff2e88',
          blinkRate: randi(60, 120),
          blinkOffset: randi(0, 120)
        };
      }

      buildings.push({ x: x, w: w, h: h, y: y, wins: wins, antenna: antenna });
      x += w + randi(1, 8);
    }

    layer.buildings = buildings;
  }

  // ── Rain drops ─────────────────────────────────────────────────────────────
  var RAIN_COUNT = 160;
  var rain = [];
  var RAIN_ANGLE = Math.PI / 2 + 0.18; // slightly angled
  var RAIN_SPEED_BASE = 14;

  function initRain() {
    rain = [];
    for (var i = 0; i < RAIN_COUNT; i++) {
      rain.push(newDrop(true));
    }
  }

  function newDrop(scatter) {
    var speed = rand(0.7, 1.4) * RAIN_SPEED_BASE;
    return {
      x: rand(0, W),
      y: scatter ? rand(-H, H) : rand(-80, -8),
      len: rand(10, 22),
      speed: speed,
      dx: Math.cos(RAIN_ANGLE) * speed,
      dy: Math.sin(RAIN_ANGLE) * speed,
      alpha: rand(0.12, 0.38)
    };
  }

  // ── Fog blobs ──────────────────────────────────────────────────────────────
  var FOG = [
    { xFrac: 0.15, yFrac: 0.72, rx: 0.34, ry: 0.12, driftX: 0.00004, alpha: 0.22 },
    { xFrac: 0.62, yFrac: 0.68, rx: 0.28, ry: 0.10, driftX: 0.00006, alpha: 0.18 },
    { xFrac: 0.85, yFrac: 0.75, rx: 0.22, ry: 0.08, driftX: 0.00003, alpha: 0.15 }
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

  // ── Draw helpers ───────────────────────────────────────────────────────────
  function drawLayer(layer) {
    var px = (mouseX - 0.5) * layer.parallaxX * W;
    var py = scrollY * layer.parallaxY;
    var baseY = layer.baseYFrac * H + py;

    ctx.save();
    ctx.translate(px, 0);

    layer.buildings.forEach(function (b) {
      var bx = b.x;
      var by = baseY - b.h;

      // Building silhouette
      ctx.fillStyle = layer.fill;
      ctx.fillRect(bx, by, b.w, b.h + 4);

      // Windows
      var padX = Math.max(3, b.w * 0.10);
      var padY = 8;
      var innerW = b.w - padX * 2;
      var innerH = b.h - padY * 2;

      b.wins.forEach(function (win) {
        var blink = Math.floor((tick + win.blinkOffset) / win.blinkRate) % 2 === 0;
        var lit = win.lit && blink;
        if (!lit) return;
        var wx = bx + padX + win.rx * innerW;
        var wy = by + padY  + win.ry * innerH;
        var ww = Math.max(3, innerW / Math.max(1, b.wins.length > 6 ? 4 : 3) - 2);
        var wh = Math.max(3, 8);
        ctx.fillStyle = layer.winColor;
        ctx.fillRect(wx, wy, ww, wh);
      });

      // Antenna
      if (b.antenna) {
        var ant = b.antenna;
        var ax = bx + b.w / 2;
        var ay = by;
        ctx.strokeStyle = 'rgba(100,130,160,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax, ay - ant.ah);
        ctx.stroke();

        // Blinking dot
        var dotOn = Math.floor((tick + ant.blinkOffset) / ant.blinkRate) % 2 === 0;
        if (dotOn) {
          ctx.fillStyle = ant.dotColor;
          ctx.beginPath();
          ctx.arc(ax, ay - ant.ah, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Horizon glow along this layer's baseline
    var glowGrad = ctx.createLinearGradient(0, baseY - 16, 0, baseY + 12);
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.05)');
    glowGrad.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-W * 0.5, baseY - 16, W * 2, 28);

    ctx.restore();
  }

  function drawRain() {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,200,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      ctx.globalAlpha = d.alpha;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(RAIN_ANGLE) * d.len,
                 d.y + Math.sin(RAIN_ANGLE) * d.len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFog() {
    fogTick += 0.3;
    FOG.forEach(function (f, i) {
      var cx = (f.xFrac + Math.sin(fogTick * f.driftX * 1000 + i) * 0.08 +
                (mouseX - 0.5) * 0.04) * W;
      var cy = f.yFrac * H;
      var rx = f.rx * W;
      var ry = f.ry * H;

      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0,   'rgba(0,20,40,' + f.alpha + ')');
      grad.addColorStop(0.5, 'rgba(0,10,20,' + (f.alpha * 0.5) + ')');
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

  function drawGround() {
    var nearBaseY = LAYERS[2].baseYFrac * H + scrollY * LAYERS[2].parallaxY;
    // Ground fill
    ctx.fillStyle = '#030507';
    ctx.fillRect(0, nearBaseY, W, H - nearBaseY);
    // Ground-level fog strip
    var gfog = ctx.createLinearGradient(0, nearBaseY, 0, nearBaseY + 80);
    gfog.addColorStop(0, 'rgba(0,229,255,0.04)');
    gfog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gfog;
    ctx.fillRect(0, nearBaseY, W, 80);
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function draw() {
    // Sky gradient
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,   '#07090d');
    sky.addColorStop(0.5, '#080d14');
    sky.addColorStop(1,   '#0a1020');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

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
      if (d.y > H + 20 || d.x > W + 20) {
        rain[i] = newDrop(false);
      }
    }
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────
  function loop() {
    tick++;
    if (!reduced) updateRain();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  window.addEventListener('scroll', function () {
    scrollY = window.scrollY;
  }, { passive: true });

  window.addEventListener('mousemove', function (e) {
    mouseX = e.clientX / window.innerWidth;
  }, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  resize();

  if (reduced) {
    // Single static frame for motion-sensitive users
    draw();
  } else {
    requestAnimationFrame(loop);
  }

})();
