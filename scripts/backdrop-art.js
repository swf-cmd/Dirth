/*
 * Procedural city backdrops for the Kyoto, Okinawa and Hokkaido themes.
 * Everything is painted on a canvas from geometry, gradients and seeded noise:
 * no photographs, image models, downloads or fonts. Rendering is repeatable,
 * so the shipped WebP files can be rebuilt with scripts/render-backdrops.cjs.
 * Like the Tokyo artwork, each scene keeps its left third quiet for the
 * welcome text. Kyoto stays a lantern-lit night, seen through a round window
 * on a washi wall; Okinawa is painted in early-afternoon sun and Hokkaido at
 * snow-light dusk, so both fade cleanly into their light interfaces.
 */
(() => {
  'use strict';

  const WIDTH = 2400;
  const HEIGHT = 1350;

  // ---------------------------------------------------------------- utilities
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noise2d(seed) {
    const rng = random(seed);
    const permutation = new Uint16Array(512);
    const order = Array.from({ length: 256 }, (_, index) => index);
    for (let index = 255; index > 0; index--) {
      const swap = Math.floor(rng() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    for (let index = 0; index < 512; index++) permutation[index] = order[index & 255];
    const gradients = Array.from({ length: 256 }, () => {
      const angle = rng() * Math.PI * 2;
      return [Math.cos(angle), Math.sin(angle)];
    });
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (hash, x, y) => gradients[hash][0] * x + gradients[hash][1] * y;
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const a = permutation[(xi & 255) + permutation[yi & 255]];
      const b = permutation[((xi + 1) & 255) + permutation[yi & 255]];
      const c = permutation[(xi & 255) + permutation[(yi + 1) & 255]];
      const d = permutation[((xi + 1) & 255) + permutation[(yi + 1) & 255]];
      const u = fade(xf), v = fade(yf);
      const top = dot(a, xf, yf) + u * (dot(b, xf - 1, yf) - dot(a, xf, yf));
      const bottom = dot(c, xf, yf - 1) + u * (dot(d, xf - 1, yf - 1) - dot(c, xf, yf - 1));
      return (top + v * (bottom - top)) * 1.41;
    };
  }

  function fbm(noise, x, y, octaves = 5, gain = 0.5, lacunarity = 2.03) {
    let amplitude = 1, frequency = 1, total = 0, norm = 0;
    for (let octave = 0; octave < octaves; octave++) {
      total += noise(x * frequency + octave * 17.3, y * frequency - octave * 9.1) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return total / norm;
  }

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  function hex(color) {
    const value = parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgba = (color, alpha = 1) => {
    const [r, g, b] = Array.isArray(color) ? color : hex(color);
    return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
  };
  const lerpColor = (a, b, t) => {
    const x = Array.isArray(a) ? a : hex(a), y = Array.isArray(b) ? b : hex(b);
    return [mix(x[0], y[0], t), mix(x[1], y[1], t), mix(x[2], y[2], t)];
  };

  function createCanvas(width = WIDTH, height = HEIGHT) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function painter(ctx) {
    const api = {
      ctx,
      gradient(stops, x0, y0, x1, y1) {
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        for (const [offset, color, alpha = 1] of stops) gradient.addColorStop(offset, rgba(color, alpha));
        return gradient;
      },
      // Soft light: a radial falloff added to whatever is below it.
      glow(x, y, radius, color, alpha = 1, operation = 'lighter', falloff = 0.22) {
        if (radius <= 0 || alpha <= 0) return;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, rgba(color, alpha));
        gradient.addColorStop(falloff, rgba(color, alpha * 0.42));
        gradient.addColorStop(0.55, rgba(color, alpha * 0.09));
        gradient.addColorStop(1, rgba(color, 0));
        ctx.save();
        ctx.globalCompositeOperation = operation;
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
      },
      ellipseGlow(x, y, rx, ry, color, alpha = 1, operation = 'lighter') {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        api.glow(0, 0, rx, color, alpha, operation);
        ctx.restore();
      },
      polygon(points, fill) {
        ctx.beginPath();
        points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      },
    };
    return api;
  }

  // Per-pixel texture helper: callback returns [r, g, b, a] in 0..255 / 0..1.
  function shade(ctx, x0, y0, width, height, callback, step = 1) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    width = Math.min(ctx.canvas.width - x0, Math.ceil(width));
    height = Math.min(ctx.canvas.height - y0, Math.ceil(height));
    if (width <= 0 || height <= 0) return;
    const layer = createCanvas(Math.ceil(width / step), Math.ceil(height / step));
    const layerContext = layer.getContext('2d');
    const image = layerContext.createImageData(layer.width, layer.height);
    const data = image.data;
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const result = callback(x0 + x * step, y0 + y * step);
        if (!result) continue;
        const offset = (y * layer.width + x) * 4;
        data[offset] = result[0]; data[offset + 1] = result[1]; data[offset + 2] = result[2];
        data[offset + 3] = clamp(result[3]) * 255;
      }
    }
    layerContext.putImageData(image, 0, 0);
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layer, x0, y0, width, height);
    ctx.restore();
  }

  // Film finish shared by every scene: gentle vignette and fine grain.
  function finish(ctx, rng, { grain = 7, vignette = 0.55, lift = [0, 0, 0], gamma = 1, gain = 1 } = {}) {
    const { width, height } = ctx.canvas;
    const vignetteGradient = ctx.createRadialGradient(width * 0.62, height * 0.42, height * 0.25, width * 0.55, height * 0.5, width * 0.78);
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const curve = new Float32Array(256);
    for (let value = 0; value < 256; value++) curve[value] = Math.pow(value / 255, gamma) * 255 * gain;
    for (let index = 0; index < data.length; index += 4) {
      const n = (rng() + rng() - 1) * grain;
      data[index] = clamp(curve[data[index]] + n + lift[0], 0, 255);
      data[index + 1] = clamp(curve[data[index + 1]] + n + lift[1], 0, 255);
      data[index + 2] = clamp(curve[data[index + 2]] + n + lift[2], 0, 255);
    }
    ctx.putImageData(image, 0, 0);
  }

  // ------------------------------------------------------------------- scenes
  const scenes = {};

  scenes.kyoto = function paintKyoto(ctx) {
    const W = WIDTH, H = HEIGHT;
    const rng = random(0x4b796f74);
    const p = painter(ctx);
    const cloudNoise = noise2d(71), stoneNoise = noise2d(72), leafNoise = noise2d(73);

    // Night sky: indigo overhead, the city's warm glow along the hills.
    ctx.fillStyle = p.gradient([[0, '#0b0918'], [0.32, '#1a1431'], [0.52, '#2d1f43'], [0.66, '#4a2c4c'], [0.78, '#2a1a2b']], 0, 0, 0, H);
    ctx.fillRect(0, 0, W, H);
    const moon = { x: W * 0.775, y: H * 0.205, r: 64 };
    p.glow(moon.x, moon.y, 620, '#9a8ac8', 0.22, 'screen', 0.12);
    p.glow(moon.x, moon.y, 260, '#d9d2f2', 0.25, 'screen', 0.18);
    // Thin moonlit clouds.
    shade(ctx, 0, 0, W, H * 0.62, (x, y) => {
      const n = fbm(cloudNoise, x / 520, y / 170, 5) + 0.18;
      const band = smooth(0.05, 0.5, n) * smooth(H * 0.02, H * 0.22, y) * (1 - smooth(H * 0.42, H * 0.6, y));
      if (band <= 0.01) return null;
      const lit = Math.exp(-Math.hypot(x - moon.x, (y - moon.y) * 1.6) / 520);
      const color = lerpColor('#3a2f5c', '#c9bde6', lit);
      return [color[0], color[1], color[2], band * (0.18 + lit * 0.42)];
    }, 3);
    for (let index = 0; index < 220; index++) {
      const x = rng() * W, y = rng() * H * 0.45, size = rng() < 0.08 ? 1.6 : 0.9;
      const alpha = (0.25 + rng() * 0.55) * (1 - smooth(H * 0.25, H * 0.45, y)) * (Math.hypot(x - moon.x, y - moon.y) > 280 ? 1 : 0.15);
      ctx.fillStyle = rgba('#e8e2ff', alpha);
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    // Moon disc with soft maria.
    const moonGradient = ctx.createRadialGradient(moon.x - 14, moon.y - 16, 4, moon.x, moon.y, moon.r);
    moonGradient.addColorStop(0, '#fffaf0'); moonGradient.addColorStop(0.75, '#f3ead6'); moonGradient.addColorStop(1, '#dcd2c2');
    ctx.fillStyle = moonGradient;
    ctx.beginPath(); ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2); ctx.fill();
    shade(ctx, moon.x - moon.r, moon.y - moon.r, moon.r * 2, moon.r * 2, (x, y) => {
      const distance = Math.hypot(x - moon.x, y - moon.y);
      if (distance > moon.r - 0.5) return null;
      const n = fbm(cloudNoise, x / 26 + 40, y / 26 - 12, 4);
      return [150, 140, 150, smooth(0.0, 0.35, n) * 0.22];
    });
    p.glow(moon.x, moon.y, 140, '#fff4dc', 0.35, 'screen', 0.35);

    // Higashiyama ridges, each a little lighter with distance.
    const ridge = (base, amplitude, scale, seed, color, alpha = 1) => {
      const ridgeNoise = noise2d(seed);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) {
        const y = base - (fbm(ridgeNoise, x / scale, 0.5, 4) * 0.5 + 0.5) * amplitude - Math.sin(x / W * Math.PI * 1.2 + seed) * amplitude * 0.25;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = rgba(color, alpha);
      ctx.fill();
    };
    ridge(H * 0.6, H * 0.2, 900, 11, '#2a2040');
    ctx.fillStyle = p.gradient([[0, '#6a4766', 0], [1, '#6a4766', 0.35]], 0, H * 0.45, 0, H * 0.62);
    ctx.fillRect(0, H * 0.45, W, H * 0.17);
    ridge(H * 0.64, H * 0.16, 620, 12, '#1a1428');
    // Distant city glow in the valley.
    p.ellipseGlow(W * 0.62, H * 0.64, W * 0.5, H * 0.1, '#c46a3c', 0.28);

    // Street geometry: a long telephoto lane rising toward the pagoda.
    const vp = { x: W * 0.705, y: H * 0.615 };
    const focal = H * 1.6;
    const P = (X, Y, d) => [vp.x + X * focal / d, vp.y + Y * focal / d];

    // Yasaka pagoda (Hokan-ji), lit warmly from below.
    const pagoda = { x: W * 0.703, base: H * 0.64, top: H * 0.085 };
    (function drawPagoda() {
      const total = pagoda.base - pagoda.top;
      const spireHeight = total * 0.27;
      const tiersTop = pagoda.top + spireHeight;
      const tierHeights = [1, 0.93, 0.87, 0.82, 0.78];
      const sum = tierHeights.reduce((a, b) => a + b, 0);
      let y = pagoda.base;
      const roofs = [];
      tierHeights.forEach((weight, tier) => {
        const height = (pagoda.base - tiersTop) * weight / sum;
        const width = 330 * (1 - tier * 0.065);
        const bodyWidth = width * (0.44 - tier * 0.012);
        const roofHeight = height * 0.42;
        const bodyTop = y - height + roofHeight * 0.55;
        // Lit body with pillars and doors.
        const body = ctx.createLinearGradient(0, bodyTop, 0, y);
        body.addColorStop(0, '#5a3524'); body.addColorStop(0.55, '#a7653a'); body.addColorStop(1, '#e09a5a');
        ctx.fillStyle = body;
        ctx.fillRect(pagoda.x - bodyWidth / 2, bodyTop, bodyWidth, y - bodyTop);
        ctx.fillStyle = 'rgba(40,18,12,0.65)';
        for (let pillar = 0; pillar <= 4; pillar++) {
          const px = pagoda.x - bodyWidth / 2 + bodyWidth * pillar / 4;
          ctx.fillRect(px - 2.2, bodyTop, 4.4, y - bodyTop);
        }
        ctx.fillStyle = 'rgba(255,214,150,0.28)';
        ctx.fillRect(pagoda.x - bodyWidth * 0.12, bodyTop + (y - bodyTop) * 0.25, bodyWidth * 0.24, (y - bodyTop) * 0.7);
        // Railing balcony line.
        ctx.fillStyle = 'rgba(30,14,10,0.8)';
        ctx.fillRect(pagoda.x - bodyWidth * 0.62, y - 7, bodyWidth * 1.24, 5);
        roofs.push({ y: bodyTop, width, roofHeight, tier });
        y -= height;
      });
      // Roofs drawn top-down so lower eaves overlap correctly.
      for (const roof of roofs.slice().reverse()) {
        const eave = roof.y + roof.roofHeight * 0.18;
        const ridgeY = roof.y - roof.roofHeight * 0.82;
        const half = roof.width / 2;
        // Glowing brackets under the eave.
        const under = ctx.createLinearGradient(0, eave - 4, 0, eave + roof.roofHeight * 0.55);
        under.addColorStop(0, 'rgba(255,190,110,0.9)'); under.addColorStop(1, 'rgba(160,80,40,0)');
        ctx.fillStyle = under;
        ctx.beginPath();
        ctx.moveTo(pagoda.x - half * 0.86, eave);
        ctx.lineTo(pagoda.x + half * 0.86, eave);
        ctx.lineTo(pagoda.x + half * 0.5, eave + roof.roofHeight * 0.55);
        ctx.lineTo(pagoda.x - half * 0.5, eave + roof.roofHeight * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pagoda.x - half * 1.02, eave - roof.roofHeight * 0.34);
        ctx.quadraticCurveTo(pagoda.x - half * 0.86, eave + roof.roofHeight * 0.06, pagoda.x - half * 0.62, eave + roof.roofHeight * 0.04);
        ctx.lineTo(pagoda.x + half * 0.62, eave + roof.roofHeight * 0.04);
        ctx.quadraticCurveTo(pagoda.x + half * 0.86, eave + roof.roofHeight * 0.06, pagoda.x + half * 1.02, eave - roof.roofHeight * 0.34);
        ctx.quadraticCurveTo(pagoda.x + half * 0.6, eave - roof.roofHeight * 0.2, pagoda.x + half * 0.24, ridgeY + roof.roofHeight * 0.1);
        ctx.lineTo(pagoda.x - half * 0.24, ridgeY + roof.roofHeight * 0.1);
        ctx.quadraticCurveTo(pagoda.x - half * 0.6, eave - roof.roofHeight * 0.2, pagoda.x - half * 1.02, eave - roof.roofHeight * 0.34);
        ctx.closePath();
        const tile = ctx.createLinearGradient(0, ridgeY, 0, eave);
        tile.addColorStop(0, '#2a2236'); tile.addColorStop(0.7, '#17121d'); tile.addColorStop(1, '#0d0a10');
        ctx.fillStyle = tile;
        ctx.fill();
        // Moonlit rim on the upper roof surface.
        ctx.strokeStyle = 'rgba(190,175,230,0.22)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Warm edge where the uplight catches the eave.
        ctx.strokeStyle = 'rgba(255,170,90,0.55)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(pagoda.x - half * 0.62, eave + roof.roofHeight * 0.04);
        ctx.lineTo(pagoda.x + half * 0.62, eave + roof.roofHeight * 0.04);
        ctx.stroke();
      }
      // Sorin spire with nine rings.
      const spireBase = tiersTop + 6;
      ctx.fillStyle = '#16111a';
      ctx.fillRect(pagoda.x - 4, pagoda.top, 8, spireBase - pagoda.top);
      for (let ring = 0; ring < 9; ring++) {
        const ry = spireBase - spireHeight * 0.22 - ring * spireHeight * 0.068;
        ctx.fillStyle = ring % 2 ? '#2b2232' : '#3a2c36';
        ctx.fillRect(pagoda.x - 15 + ring * 0.6, ry, 30 - ring * 1.2, 4.5);
      }
      ctx.fillStyle = '#1d1720';
      ctx.beginPath(); ctx.ellipse(pagoda.x, pagoda.top + 6, 7, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,120,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pagoda.x - 4, spireBase); ctx.lineTo(pagoda.x - 4, pagoda.top + 18); ctx.stroke();
      p.glow(pagoda.x, pagoda.base - total * 0.25, total * 0.55, '#d9783f', 0.16);
    })();

    // Mist where the lane meets the temple grounds.
    ctx.fillStyle = p.gradient([[0, '#8a5a6a', 0], [0.6, '#8a5a6a', 0.18], [1, '#8a5a6a', 0]], 0, H * 0.52, 0, H * 0.7);
    ctx.fillRect(0, H * 0.52, W, H * 0.18);

    // Stone lane, seen from a little above head height.
    const G = 1.9;
    const near = 7.4, far = 260;
    const left = -4.3, right = 4.2;
    p.polygon([P(left, G, near * 0.8), P(right, G, near * 0.8), P(right, G, far), P(left, G, far)], '#1f1820');
    shade(ctx, 0, vp.y, W, H - vp.y, (x, y) => {
      const depth = G * focal / Math.max(1, y - vp.y);
      if (depth < near * 0.7 || depth > far) return null;
      const X = (x - vp.x) * depth / focal;
      if (X < left - 0.5 || X > right + 0.5) return null;
      const n = fbm(stoneNoise, X * 1.7, depth * 0.9, 3);
      const row = Math.floor(depth * 1.15);
      const seamZ = Math.abs(((depth * 1.15) % 1) - 0.5) > 0.465 ? 1 : 0;
      const seamX = Math.abs((((X + (row % 2) * 0.47 + (row % 3) * 0.21) * 1.25) % 1 + 1) % 1 - 0.5) > 0.47 ? 1 : 0;
      const wet = smooth(-0.1, 0.7, fbm(stoneNoise, X * 0.6 + 50, depth * 0.25, 3));
      const fog = smooth(25, 140, depth);
      const light = 27 + n * 13 - (seamZ || seamX) * 13 + (row * 7919 % 11) * 0.6;
      return [mix(light * 1.06 + wet * 5, 92, fog * 0.45), mix(light * 0.88, 62, fog * 0.45), mix(light * 1.04 + wet * 5, 86, fog * 0.45), 1];
    }, 2);

    // Machiya on both sides of the lane: lattice, noren, inuyarai fences.
    const houses = [];
    for (const side of [-1, 1]) {
      let d = side < 0 ? 3.2 : 5.5;
      while (d < 130) {
        const length = 7 + rng() * 5;
        houses.push({
          side, d0: d, d1: d + length, height: 5.4 + rng() * 1.6, lantern: rng() < 0.9, red: rng() < 0.3,
          door: 0.28 + rng() * 0.44, glow: 0.35 + rng() * 0.65, tone: rng(), noren: ['#1d2c44', '#5c1a1d', '#2b3324', '#3a2440'][Math.floor(rng() * 4)],
        });
        d += length;
      }
    }
    houses.sort((a, b) => b.d0 - a.d0);
    const lanterns = [];
    const lineWidth = (base, d) => Math.max(0.6, base * focal / d / 300);
    for (const house of houses) {
      const X = house.side < 0 ? left : right;
      const inward = -house.side;
      const roof = G - house.height, mid = G - 3.0;
      const nearFade = 1 - smooth(9, 3.5, house.d0) * 0.55;
      const corners = [P(X, G, house.d0), P(X, G, house.d1), P(X, roof, house.d1), P(X, roof, house.d0)];
      const facade = ctx.createLinearGradient(corners[0][0], 0, corners[1][0], 0);
      facade.addColorStop(0, rgba(lerpColor('#2a1914', '#33201a', house.tone))); facade.addColorStop(1, '#150e0e');
      p.polygon(corners, facade);
      // Board seams on the upper wall.
      ctx.strokeStyle = 'rgba(8,4,4,0.45)';
      ctx.lineWidth = lineWidth(1.4, house.d0);
      for (let seam = 0; seam <= (house.d1 - house.d0) * 1.4; seam++) {
        const d = house.d0 + seam / 1.4;
        ctx.beginPath(); ctx.moveTo(...P(X, mid - 0.15, d)); ctx.lineTo(...P(X, roof + 0.4, d)); ctx.stroke();
      }
      // Ground-floor kōshi lattice, lit from the room behind.
      const latticeTop = mid + 0.35, latticeBottom = G - 0.95;
      const doorD = house.d0 + (house.d1 - house.d0) * house.door;
      const room = [P(X, latticeBottom, house.d0 + 0.3), P(X, latticeBottom, house.d1 - 0.3), P(X, latticeTop, house.d1 - 0.3), P(X, latticeTop, house.d0 + 0.3)];
      const roomGlow = ctx.createLinearGradient(0, room[2][1], 0, room[0][1]);
      roomGlow.addColorStop(0, rgba('#e89a52', 0.32 * house.glow * nearFade)); roomGlow.addColorStop(1, rgba('#ffc27a', 0.62 * house.glow * nearFade));
      p.polygon(room, roomGlow);
      const slats = Math.round((house.d1 - house.d0) * 5.5);
      ctx.strokeStyle = '#140b09';
      for (let slat = 0; slat <= slats; slat++) {
        const d = house.d0 + 0.3 + (house.d1 - house.d0 - 0.6) * slat / slats;
        ctx.lineWidth = lineWidth(slat % 4 === 0 ? 3.2 : 1.6, d);
        ctx.beginPath(); ctx.moveTo(...P(X, latticeBottom, d)); ctx.lineTo(...P(X, latticeTop, d)); ctx.stroke();
      }
      // Doorway with a noren curtain and light spilling onto the stones.
      const doorway = [P(X, G, doorD - 0.65), P(X, G, doorD + 0.65), P(X, mid + 0.35, doorD + 0.65), P(X, mid + 0.35, doorD - 0.65)];
      const inside = ctx.createLinearGradient(0, doorway[2][1], 0, doorway[0][1]);
      inside.addColorStop(0, '#1a100b'); inside.addColorStop(0.45, rgba('#6a3a1e', 1)); inside.addColorStop(1, rgba('#c98446', 0.3 + 0.55 * nearFade));
      p.polygon(doorway, inside);
      for (let panel = 0; panel < 3; panel++) {
        const a = doorD - 0.62 + panel * 0.42, b = a + 0.38;
        const cloth = ctx.createLinearGradient(0, P(X, mid + 0.35, a)[1], 0, P(X, mid + 1.4, a)[1]);
        cloth.addColorStop(0, rgba(lerpColor(house.noren, '#000000', 0.25))); cloth.addColorStop(1, rgba(lerpColor(house.noren, '#ffffff', 0.08)));
        p.polygon([P(X, mid + 0.35, a), P(X, mid + 0.35, b), P(X, mid + 1.4, b), P(X, mid + 1.4, a)], cloth);
      }
      const [sx, sy] = P(X + inward * 1.2, G, doorD);
      p.ellipseGlow(sx, sy, 2.4 * focal / doorD, 0.5 * focal / doorD, '#ff9d50', 0.16 * house.glow);
      // Inuyarai: the curved bamboo guard along the wall's foot.
      const fence = (a, b) => {
        if (b - a < 0.4) return;
        p.polygon([P(X, G - 0.78, a), P(X, G - 0.78, b), P(X + inward * 0.4, G, b), P(X + inward * 0.4, G, a)], 'rgba(24,15,11,0.92)');
        ctx.strokeStyle = 'rgba(176,128,84,0.24)';
        ctx.lineWidth = lineWidth(1, a);
        for (let rib = 0; rib <= (b - a) * 6; rib++) {
          const d = a + rib / 6;
          ctx.beginPath(); ctx.moveTo(...P(X, G - 0.78, d)); ctx.quadraticCurveTo(...P(X + inward * 0.36, G - 0.3, d), ...P(X + inward * 0.4, G, d)); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(214,160,104,0.32)'; ctx.lineWidth = lineWidth(1.6, a);
        ctx.beginPath(); ctx.moveTo(...P(X, G - 0.78, a)); ctx.lineTo(...P(X, G - 0.78, b)); ctx.stroke();
      };
      fence(house.d0 + 0.2, doorD - 0.7);
      fence(doorD + 0.7, house.d1 - 0.2);
      // Eave roof between floors, projecting into the lane.
      const eaveOut = X + inward * 0.95;
      p.polygon([P(X, mid, house.d0), P(X, mid, house.d1), P(eaveOut, mid + 0.42, house.d1), P(eaveOut, mid + 0.42, house.d0)], '#110b0f');
      ctx.strokeStyle = 'rgba(170,150,205,0.28)'; ctx.lineWidth = lineWidth(2, house.d0);
      ctx.beginPath(); ctx.moveTo(...P(eaveOut, mid + 0.42, house.d0)); ctx.lineTo(...P(eaveOut, mid + 0.42, house.d1)); ctx.stroke();
      // Mushiko-mado: the slatted clay windows of the low upper floor.
      const windowD = house.d0 + (house.d1 - house.d0) * (0.5 + (house.tone - 0.5) * 0.3);
      const span = Math.min(1.8, (house.d1 - house.d0) * 0.22);
      const top = mid - 1.75, bottom = mid - 0.75;
      p.polygon([P(X, bottom, windowD - span), P(X, bottom, windowD + span), P(X, top, windowD + span), P(X, top, windowD - span)], rgba('#c27a40', (0.12 + 0.2 * house.glow) * nearFade));
      ctx.strokeStyle = '#1b110e';
      for (let slat = 0; slat <= 12; slat++) {
        const d = windowD - span + span * 2 * slat / 12;
        ctx.lineWidth = lineWidth(3.6, d);
        ctx.beginPath(); ctx.moveTo(...P(X, bottom, d)); ctx.lineTo(...P(X, top, d)); ctx.stroke();
      }
      // Main roof eave with a moonlit edge.
      const roofOut = X + inward * 1.15;
      p.polygon([P(X, roof, house.d0), P(X, roof, house.d1), P(roofOut, roof + 0.55, house.d1), P(roofOut, roof + 0.55, house.d0)], '#0e0a0f');
      ctx.strokeStyle = 'rgba(185,170,225,0.32)';
      ctx.beginPath(); ctx.moveTo(...P(roofOut, roof + 0.55, house.d0)); ctx.lineTo(...P(roofOut, roof + 0.55, house.d1)); ctx.stroke();
      // Distance haze settles over the farther houses.
      const haze = smooth(14, 120, house.d0) * 0.62;
      if (haze > 0.01) p.polygon([P(X, G, house.d0), P(X, G, house.d1), P(roofOut, roof - 0.2, house.d1), P(roofOut, roof - 0.2, house.d0)], rgba('#4a3048', haze));
      if (house.lantern) lanterns.push({ X: X + inward * 0.72, Y: mid + 0.95, d: doorD - 1.15, red: house.red });
    }

    // Paper lanterns and their reflections on the stones.
    lanterns.sort((a, b) => b.d - a.d);
    for (const lantern of lanterns) {
      const [x, y] = P(lantern.X, lantern.Y, lantern.d);
      const scale = focal / lantern.d;
      const rx = 0.2 * scale, ry = 0.3 * scale;
      const color = lantern.red ? '#ff6a3a' : '#ffbe62';
      const [gx, gy] = P(lantern.X, G, lantern.d);
      p.ellipseGlow(gx, gy + 6, rx * 7, ry * 2.6, color, 0.35);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const streak = ctx.createLinearGradient(0, gy, 0, gy + ry * 7);
      streak.addColorStop(0, rgba(color, 0.32)); streak.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = streak;
      ctx.fillRect(gx - rx * 0.7, gy, rx * 1.4, ry * 7);
      ctx.restore();
      p.glow(x, y, rx * 9, color, 0.32);
      const body = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.2, 0, x, y, ry);
      body.addColorStop(0, '#fff6dc'); body.addColorStop(0.5, lantern.red ? '#ff9a5a' : '#ffd68a'); body.addColorStop(1, lantern.red ? '#c2381e' : '#e08a2e');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(80,30,10,0.45)'; ctx.lineWidth = Math.max(0.5, scale * 0.012);
      for (let rib = -2; rib <= 2; rib++) {
        ctx.beginPath(); ctx.ellipse(x, y + rib * ry * 0.33, rx * Math.sqrt(1 - (rib * 0.33) ** 2), Math.max(0.3, ry * 0.05), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#1a0f0c';
      ctx.fillRect(x - rx * 0.55, y - ry * 1.08, rx * 1.1, ry * 0.14);
      ctx.fillRect(x - rx * 0.55, y + ry * 0.94, rx * 1.1, ry * 0.14);
    }

    // Warm haze over the lane.
    p.ellipseGlow(vp.x, vp.y + 40, W * 0.22, H * 0.12, '#ff9a55', 0.18);

    // Momiji: maple branches reaching in from outside the frame and over roofs.
    const leaf = (x, y, size, angle, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let lobe = 0; lobe < 7; lobe++) {
        const a = -Math.PI / 2 + (lobe - 3) * 0.5;
        const reach = size * (lobe === 3 ? 1 : lobe === 2 || lobe === 4 ? 0.92 : lobe === 1 || lobe === 5 ? 0.7 : 0.42);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a - 0.24) * reach * 0.55, Math.sin(a - 0.24) * reach * 0.55, Math.cos(a) * reach, Math.sin(a) * reach);
        ctx.quadraticCurveTo(Math.cos(a + 0.24) * reach * 0.55, Math.sin(a + 0.24) * reach * 0.55, 0, 0);
      }
      ctx.fill();
      ctx.restore();
    };
    const maple = ({ anchor, tips, leaves, seed, light, scale = 1 }) => {
      const leafRng = random(seed);
      const ends = [];
      const grow = (x, y, angle, length, width, depth) => {
        const bend = (leafRng() - 0.5) * 0.7;
        const x1 = x + Math.cos(angle) * length, y1 = y + Math.sin(angle) * length;
        ctx.strokeStyle = '#120a0c';
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(angle + bend) * length * 0.5, y + Math.sin(angle + bend) * length * 0.5, x1, y1);
        ctx.stroke();
        if (depth <= 0 || width < 1.2) { ends.push([x1, y1]); return; }
        const children = 2 + Math.floor(leafRng() * 2);
        for (let child = 0; child < children; child++) {
          grow(x1, y1, angle + (leafRng() - 0.5) * 1.3, length * (0.55 + leafRng() * 0.25), width * 0.62, depth - 1);
        }
        ends.push([x1, y1]);
      };
      for (const [angle, length] of tips) grow(anchor[0], anchor[1], angle, length * scale, 14 * scale, 4);
      for (let index = 0; index < leaves; index++) {
        const [ex, ey] = ends[Math.floor(leafRng() * ends.length)];
        const spread = 46 * scale;
        const x = ex + (leafRng() - 0.5) * spread * 2.2, y = ey + (leafRng() - 0.4) * spread * 1.6;
        const n = fbm(leafNoise, x / 120, y / 120, 3);
        const lit = clamp(0.45 + n * 0.8 + light(x, y));
        const color = lerpColor(lerpColor('#3c0c14', '#a8221f', lit), lerpColor('#d9482a', '#f6a24a', lit), lit * lit);
        leaf(x, y, (6 + leafRng() * 8) * scale, leafRng() * Math.PI * 2, rgba(color, 0.62 + leafRng() * 0.38));
      }
    };
    maple({ anchor: [W * 1.02, -H * 0.04], tips: [[2.2, 260], [1.95, 230], [2.55, 170], [1.7, 200]], leaves: 2600, seed: 91, light: (x, y) => (y - H * 0.1) / H * 0.6 - 0.15 });
    maple({ anchor: [W * 0.37, H * 0.2], tips: [[0.2, 170], [0.55, 150], [-0.15, 140]], leaves: 1500, seed: 92, light: (x, y) => (y - H * 0.25) / H * 1.4, scale: 0.85 });
    maple({ anchor: [W * 1.0, H * 0.4], tips: [[2.9, 170], [3.3, 140], [2.6, 120]], leaves: 1100, seed: 93, light: (x, y) => (y - H * 0.4) / H * 1.6 + 0.1, scale: 0.8 });
    p.glow(W * 0.9, H * 0.55, 280, '#ff8a40', 0.1);
    p.glow(W * 0.45, H * 0.38, 240, '#ff8a40', 0.06);

    finish(ctx, rng, { grain: 6, vignette: 0.42, gamma: 0.82, gain: 1.1 });
  };

  scenes.okinawa = function paintOkinawa(ctx) {
    const W = WIDTH, H = HEIGHT;
    const rng = random(0x4f6b6e77);
    const p = painter(ctx);
    const cloudNoise = noise2d(201), seaNoise = noise2d(202), rockNoise = noise2d(203), sandNoise = noise2d(204);
    const horizon = H * 0.445;
    // The early-afternoon sun stands high to the upper right.
    const sun = { x: W * 0.84, y: -H * 0.12 };

    // Clear trade-wind sky: deep cerulean overhead, washed pale at the horizon.
    ctx.fillStyle = p.gradient([[0, '#2f86d0'], [0.35, '#55a3e2'], [0.7, '#9fcdf0'], [0.9, '#d6ecf7'], [1, '#eef8fb']], 0, 0, 0, horizon);
    ctx.fillRect(0, 0, W, horizon + 2);
    p.glow(sun.x, sun.y, W * 0.55, '#ffffff', 0.32, 'screen', 0.2);
    p.glow(sun.x, sun.y, W * 0.2, '#fffbe8', 0.5, 'screen', 0.3);
    // Fair-weather cumulus in rows above the horizon, white tops, blue-grey bases.
    shade(ctx, 0, H * 0.04, W, horizon - H * 0.04, (x, y) => {
      const row = y / horizon;
      const scale = 0.35 + row * 0.9;
      const puff = fbm(cloudNoise, x / (520 * scale), y / (150 * scale), 5) + fbm(cloudNoise, x / 140 + 50, y / 70, 3) * 0.28;
      const band = smooth(0.15, 0.55, row) * (1 - smooth(0.93, 1, row)) + (1 - smooth(0.05, 0.22, row)) * 0.4;
      const density = smooth(0.12, 0.42, puff + band * 0.32 - 0.22);
      if (density < 0.01) return null;
      // Lighter on top of each billow, cooler and greyer underneath.
      const above = fbm(cloudNoise, x / (520 * scale), (y - 26) / (150 * scale), 5);
      const lit = smooth(-0.15, 0.25, puff - above + 0.08);
      const color = lerpColor(lerpColor('#b6c9df', '#d7e3ef', row), '#ffffff', lit);
      return [color[0], color[1], color[2], density * (0.55 + row * 0.4)];
    }, 2);

    // Ie-jima and the Motobu headland, hazy blue-green on the horizon.
    const island = (x0, x1, height, color, peak = 0) => {
      ctx.beginPath(); ctx.moveTo(x0, horizon + 1);
      for (let x = x0; x <= x1; x += 4) {
        const t = (x - x0) / (x1 - x0);
        const tower = peak ? Math.exp(-(((t - peak) / 0.05) ** 2)) * height * 1.8 : 0;
        ctx.lineTo(x, horizon - Math.sin(Math.PI * t) ** 0.6 * height * (0.8 + 0.2 * fbm(rockNoise, x / 60, 2, 2)) - tower);
      }
      ctx.lineTo(x1, horizon + 1); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    island(W * 0.26, W * 0.41, 18, '#8fb2c4', 0.42);
    island(W * 0.44, W * 0.52, 12, '#9dbccc');
    island(W * 0.54, W * 0.58, 7, '#aac6d3');

    // Sea: navy at the horizon, cobalt, then emerald and turquoise over the reef
    // flats, so clear near the shore that the sand shows through.
    shade(ctx, 0, horizon, W, H - horizon, (x, y) => {
      const t = (y - horizon) / (H - horizon);
      const depth = 1 / (t + 0.012);
      const swell = fbm(seaNoise, x / (90 + t * 900), depth * 0.9, 4);
      const ripple = fbm(seaNoise, x / (20 + t * 260) + 80, depth * 3.2, 3);
      const offshore = lerpColor('#1b4f97', '#1f6fb6', smooth(0, 0.22, t));
      const shelf = smooth(0.18, 0.62, t) * smooth(W * 1.02, W * 0.3, x - t * W * 0.25);
      let color = lerpColor(offshore, lerpColor('#0f9fa6', '#36cdc6', smooth(0.45, 0.95, t)), shelf);
      // Light sand under clear water near the beach.
      const shallow = smooth(0.62, 0.98, t) * smooth(W * 0.45, W * 0.75, x);
      color = lerpColor(color, '#9fe7da', shallow * 0.75);
      const facet = smooth(0.15, 0.55, swell + ripple * 0.5);
      color = lerpColor(color, lerpColor('#e8f7ff', '#7fd8e6', smooth(0, 0.3, t)), facet * (0.22 - t * 0.08));
      // Reef patches, dark green-brown through the water.
      const reef = smooth(0.08, 0.42, fbm(seaNoise, x / 260 + 300, y / 90, 3)) * smooth(0.42, 0.9, t) * 0.42;
      color = lerpColor(color, '#2d6b6a', reef);
      // Sunlight scattered across the water, strongest toward the sun.
      const toward = Math.exp(-(((x - sun.x) / (W * 0.42)) ** 2));
      const sparkle = smooth(0.32, 0.62, ripple + swell * 0.6) * (0.25 + toward * 0.75) * (1 - smooth(0.25, 0.9, t) * 0.7);
      color = lerpColor(color, '#ffffff', clamp(sparkle * 1.1));
      return [color[0], color[1], color[2], 1];
    }, 2);
    // Haze where sea meets sky.
    ctx.fillStyle = p.gradient([[0, '#eef8fb', 0], [0.5, '#eef8fb', 0.55], [1, '#eef8fb', 0]], 0, horizon - 22, 0, horizon + 22);
    ctx.fillRect(0, horizon - 22, W, 44);

    // Cape Manzamo: a grassy limestone plateau ending in its elephant-trunk arch.
    const cliffTop = horizon - H * 0.095, cliffBase = horizon + 26;
    const x0 = W * 0.715, x1 = W * 1.02;
    const top = x => {
      const t = (x - x0) / (x1 - x0);
      const shoulder = smooth(0, 0.09, t);
      return mix(cliffBase - 40, cliffTop + fbm(rockNoise, x / 160, 4, 3) * 10, shoulder) + Math.sin(t * 9) * 3;
    };
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(x0 - 30, cliffBase + 2);
      ctx.quadraticCurveTo(x0 - 12, cliffBase - 30, x0, cliffBase - 40);
      for (let x = x0; x <= x1; x += 5) ctx.lineTo(x, top(x));
      ctx.lineTo(x1, cliffBase + 2);
      ctx.closePath();
    };
    outline();
    const rock = ctx.createLinearGradient(0, cliffTop, 0, cliffBase);
    rock.addColorStop(0, '#d9d1bc'); rock.addColorStop(0.55, '#b9b19c'); rock.addColorStop(1, '#8c8878');
    ctx.fillStyle = rock; ctx.fill();
    ctx.save();
    outline(); ctx.clip();
    shade(ctx, x0 - 30, cliffTop - 10, x1 - x0 + 30, cliffBase - cliffTop + 20, (x, y) => {
      const strata = fbm(rockNoise, x / 140, y / 9, 4);
      const pits = fbm(rockNoise, x / 18 + 40, y / 14, 3);
      // The seaward face turns from the sun and falls into soft shadow.
      const face = Math.exp(-(x - x0 + 30) / 120);
      const band = 0.5 + 0.5 * Math.sin(y / 11 + strata * 4);
      const color = lerpColor(lerpColor('#efe7d2', '#a59d88', band * 0.6 + pits * 0.35), '#7c8486', clamp(face * 0.75));
      return [color[0], color[1], color[2], 0.85];
    }, 2);
    // Sea notches worn into the foot of the cliff.
    ctx.fillStyle = p.gradient([[0, '#5c6466', 0], [1, '#4a5658', 0.55]], 0, cliffBase - 26, 0, cliffBase);
    ctx.fillRect(x0 - 30, cliffBase - 26, x1 - x0 + 30, 28);
    ctx.restore();
    // The arch where the trunk meets the sea, with the bright sea showing through.
    const archX = W * 0.733, archTop = cliffBase - 62, archWidth = 52;
    ctx.beginPath();
    ctx.moveTo(archX - archWidth / 2, cliffBase + 2);
    ctx.bezierCurveTo(archX - archWidth * 0.55, archTop + 10, archX - archWidth * 0.1, archTop - 6, archX + archWidth * 0.18, archTop);
    ctx.bezierCurveTo(archX + archWidth * 0.5, archTop + 8, archX + archWidth * 0.55, cliffBase - 20, archX + archWidth * 0.48, cliffBase + 2);
    ctx.closePath();
    const through = ctx.createLinearGradient(0, archTop, 0, cliffBase);
    through.addColorStop(0, '#d6ecf7'); through.addColorStop(0.55, '#7fb8dc'); through.addColorStop(1, '#2a72b6');
    ctx.fillStyle = through; ctx.fill();
    // Sun-warmed grass on the plateau.
    for (let x = x0 + (x1 - x0) * 0.08; x <= x1; x += 6) {
      const y = top(x);
      const shade2 = fbm(rockNoise, x / 30, 7, 2);
      ctx.fillStyle = rgba(lerpColor('#3f7d36', '#7fb54e', 0.5 + shade2));
      ctx.beginPath(); ctx.ellipse(x, y + 3, 10, 5 + Math.abs(shade2) * 14, 0, Math.PI, 0); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(214,240,150,0.6)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 5) x === x0 ? ctx.moveTo(x, top(x) - 4) : ctx.lineTo(x, top(x) - 4 - Math.abs(fbm(rockNoise, x / 30, 7, 2)) * 10);
    ctx.stroke();
    // The cape's reflection, a darker turquoise on the swell.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, cliffBase * 1.32);
    ctx.scale(1, -0.32);
    outline();
    ctx.fillStyle = '#0b4f6e'; ctx.fill();
    ctx.restore();

    // A sabani with a white sail, out over the reef.
    (function sabani(x, y, scale) {
      ctx.fillStyle = '#3a2a22';
      ctx.beginPath();
      ctx.moveTo(x - 46 * scale, y); ctx.quadraticCurveTo(x, y + 9 * scale, x + 52 * scale, y - 4 * scale);
      ctx.lineTo(x + 40 * scale, y + 2 * scale); ctx.quadraticCurveTo(x, y + 12 * scale, x - 40 * scale, y + 4 * scale); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 2.2 * scale;
      ctx.beginPath(); ctx.moveTo(x - 4 * scale, y + 2 * scale); ctx.lineTo(x - 2 * scale, y - 92 * scale); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 2 * scale, y - 92 * scale); ctx.quadraticCurveTo(x + 30 * scale, y - 50 * scale, x + 34 * scale, y - 6 * scale);
      ctx.lineTo(x - 2 * scale, y - 4 * scale); ctx.closePath();
      const sail = ctx.createLinearGradient(x, y - 92 * scale, x + 34 * scale, y);
      sail.addColorStop(0, '#ffffff'); sail.addColorStop(1, '#e3e8ea');
      ctx.fillStyle = sail; ctx.fill();
      ctx.fillStyle = 'rgba(11,60,85,0.22)';
      ctx.beginPath(); ctx.ellipse(x + 4 * scale, y + 10 * scale, 50 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.fill();
    })(W * 0.555, horizon + 70, 0.7);

    // Beach: white coral sand in the lower right, lace foam at the waterline.
    const shoreline = x => H * 0.8 + Math.pow(Math.max(0, (W * 0.98 - x) / (W * 0.5)), 1.6) * H * 0.2 + Math.sin(x / 140) * 6 + Math.sin(x / 57) * 3;
    const sandPath = () => {
      ctx.beginPath(); ctx.moveTo(W * 0.4, H + 2);
      for (let x = W * 0.4; x <= W + 6; x += 6) ctx.lineTo(x, shoreline(x));
      ctx.lineTo(W + 6, H + 2); ctx.closePath();
    };
    ctx.save();
    sandPath(); ctx.clip();
    shade(ctx, W * 0.4, H * 0.78, W * 0.6, H * 0.22, (x, y) => {
      const edge = y - shoreline(x);
      const wet = Math.exp(-edge / 40);
      const n = fbm(sandNoise, x / 50, y / 22, 4);
      const dry = lerpColor('#f1ead8', '#fbf8ef', 0.5 + n * 0.5);
      const color = lerpColor(dry, lerpColor('#d8cbb0', '#c9d8cf', 0.5 + n), wet * 0.75);
      return [color[0], color[1], color[2], 1];
    }, 2);
    ctx.restore();
    ctx.save();
    for (let band = 0; band < 4; band++) {
      ctx.strokeStyle = rgba('#ffffff', 0.85 - band * 0.18);
      ctx.lineWidth = 3 - band * 0.55;
      ctx.beginPath();
      for (let x = W * 0.4; x <= W + 6; x += 5) {
        const y = shoreline(x) - band * (12 + band * 4) - Math.max(0, Math.sin(x / 80 + band * 2.3)) * (4 + band * 2) + fbm(sandNoise, x / 40, band * 3, 2) * 4;
        x === W * 0.4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Two coconut palms leaning in from the right, lit by the high sun.
    const palm = (baseX, baseY, topX, topY, scale, seed) => {
      const palmRng = random(seed);
      ctx.lineCap = 'round';
      const bend = 90 * scale;
      const trunk = t => [mix(baseX, topX, t) + Math.sin(t * Math.PI) * bend * (1 - t * 0.3), mix(baseY, topY, t)];
      for (let step = 0; step < 40; step++) {
        const t0 = step / 40, t1 = (step + 1) / 40;
        ctx.strokeStyle = rgba(lerpColor('#6f5a44', '#a18a6c', (step % 3) / 3));
        ctx.lineWidth = mix(30, 13, t0) * scale;
        ctx.beginPath(); ctx.moveTo(...trunk(t0)); ctx.lineTo(...trunk(t1)); ctx.stroke();
      }
      const fronds = 13;
      for (let frond = 0; frond < fronds; frond++) {
        const angle = -Math.PI * 1.05 + frond / (fronds - 1) * Math.PI * 1.1 + (palmRng() - 0.5) * 0.22;
        const length = (240 + palmRng() * 110) * scale;
        const lift = Math.sin(angle) < 0 ? -Math.sin(angle) : 0;
        const cx = topX + Math.cos(angle) * length * 0.5, cy = topY + Math.sin(angle) * length * 0.42 - 70 * scale * (0.4 + lift);
        const ex = topX + Math.cos(angle) * length, ey = topY + Math.sin(angle) * length * 0.3 + length * (0.35 + palmRng() * 0.25);
        const point = t => [(1 - t) * (1 - t) * topX + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * cy + t * t * ey];
        // Upper fronds catch the sun; lower ones hang in their own shade.
        const light = clamp(0.25 + lift * 0.9 + palmRng() * 0.2);
        const leaf = lerpColor('#1f5b32', '#77b04a', light);
        ctx.strokeStyle = rgba(lerpColor(leaf, '#4a5a2a', 0.3));
        ctx.lineWidth = 3.4 * scale;
        ctx.beginPath(); ctx.moveTo(topX, topY); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
        for (let leaflet = 2; leaflet < 34; leaflet++) {
          const t = leaflet / 34;
          const [lx, ly] = point(t);
          const [nx, ny] = point(Math.min(1, t + 0.02));
          const heading = Math.atan2(ny - ly, nx - lx);
          const reach = (1 - t * 0.55) * (62 + palmRng() * 14) * scale;
          for (const sideSign of [-1, 1]) {
            const leafAngle = heading + sideSign * (0.62 + palmRng() * 0.3);
            const tipX = lx + Math.cos(leafAngle) * reach * 0.85;
            const tipY = ly + Math.sin(leafAngle) * reach * 0.6 + reach * 0.32;
            ctx.strokeStyle = rgba(lerpColor(leaf, sideSign < 0 ? '#a6d26a' : '#1a4a2a', 0.18 + palmRng() * 0.15));
            ctx.lineWidth = (3.2 - t * 1.6) * scale;
            ctx.beginPath(); ctx.moveTo(lx, ly);
            ctx.quadraticCurveTo(lx + Math.cos(leafAngle) * reach * 0.5, ly + Math.sin(leafAngle) * reach * 0.4, tipX, tipY);
            ctx.stroke();
          }
        }
      }
      for (let nut = 0; nut < 5; nut++) {
        ctx.fillStyle = nut % 2 ? '#5c6a2c' : '#7a7a32';
        ctx.beginPath(); ctx.arc(topX + (palmRng() - 0.5) * 34 * scale, topY + 14 * scale + palmRng() * 16 * scale, 10 * scale, 0, Math.PI * 2); ctx.fill();
      }
    };
    palm(W * 1.03, H * 1.03, W * 0.915, H * 0.16, 1, 301);
    palm(W * 1.09, H * 0.95, W * 0.99, H * 0.33, 0.78, 302);
    finish(ctx, rng, { grain: 3, vignette: 0.04, gamma: 1, gain: 1 });
  };

  scenes.hokkaido = function paintHokkaido(ctx) {
    const W = WIDTH, H = HEIGHT;
    const rng = random(0x4f746172);
    const p = painter(ctx);
    const skyNoise = noise2d(401), waterNoise = noise2d(402), stoneNoise = noise2d(403), snowNoise = noise2d(404);
    const vp = { x: W * 0.6, y: H * 0.5 };
    const focal = H * 1.25;
    // The canal bends gently left as it recedes.
    const bend = d => -0.00055 * d * d;
    const P = (X, Y, d) => [vp.x + (X + bend(d)) * focal / d, vp.y + Y * focal / d];
    const water = 5, walk = 3.9;
    const canalLeft = -9, canalRight = 7;
    const haze = d => smooth(30, 240, d);
    // Falling snow fills the distance with pale, rosy light.
    const hazeColor = '#d9dbe8';

    // Snow-light dusk: periwinkle overhead, a blush of rose and peach low down.
    ctx.fillStyle = p.gradient([[0, '#93a9d2'], [0.22, '#aebfe0'], [0.4, '#cbd3ea'], [0.5, '#e8dbe4'], [0.56, '#f2e1dc'], [0.64, '#e3e3ee']], 0, 0, 0, H);
    ctx.fillRect(0, 0, W, H);
    shade(ctx, 0, 0, W, H * 0.55, (x, y) => {
      const n = fbm(skyNoise, x / 700, y / 260, 5);
      const a = smooth(-0.2, 0.6, n) * 0.4 * smooth(0, H * 0.3, y);
      const color = lerpColor('#c3cce6', '#f6e3e2', smooth(H * 0.25, H * 0.52, y));
      return [color[0], color[1], color[2], a];
    }, 3);
    p.ellipseGlow(vp.x, vp.y, W * 0.45, H * 0.14, '#ffe2d0', 0.35, 'screen');
    // Tengu-yama behind the town, white under snow, its ski run lit in a thin line.
    const hill = (base, amplitude, center, width, seed, color) => {
      const hillNoise = noise2d(seed);
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) {
        const shape = Math.exp(-(((x - center) / width) ** 2));
        ctx.lineTo(x, base - amplitude * shape - fbm(hillNoise, x / 300, 1, 3) * 18);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    hill(vp.y + 6, H * 0.12, W * 0.42, W * 0.26, 411, '#c4cbe0');
    // Bare forest on the slope, a cool grey stipple through the snow.
    shade(ctx, W * 0.1, vp.y - H * 0.13, W * 0.65, H * 0.14, (x, y) => {
      const crest = vp.y + 6 - H * 0.12 * Math.exp(-(((x - W * 0.42) / (W * 0.26)) ** 2)) - fbm(noise2d(411), x / 300, 1, 3) * 18;
      if (y < crest + 4) return null;
      const n = fbm(stoneNoise, x / 9, y / 22, 3);
      return [120, 128, 152, smooth(0.05, 0.4, n) * 0.35 * smooth(crest, crest + 30, y)];
    }, 2);
    hill(vp.y + 10, H * 0.07, W * 0.8, W * 0.22, 412, '#b6bed6');
    for (let index = 0; index < 26; index++) {
      const t = index / 25;
      const x = W * 0.36 + t * W * 0.1, y = vp.y + 6 - H * 0.12 * Math.exp(-(((x - W * 0.42) / (W * 0.26)) ** 2)) + t * 40 + 8;
      p.glow(x, y, 7, '#ffd29a', 0.45, 'source-over', 0.2);
    }
    // Town lights coming on at the canal's far end.
    for (let index = 0; index < 90; index++) {
      const x = vp.x + (rng() - 0.5) * W * 0.36, y = vp.y + (rng() - 0.3) * 26;
      p.glow(x, y, 4 + rng() * 7, rng() < 0.75 ? '#ffbf73' : '#fff2da', 0.35 + rng() * 0.35, 'source-over', 0.2);
    }
    p.ellipseGlow(vp.x, vp.y + 6, W * 0.18, H * 0.04, '#ffd6b0', 0.3, 'screen');

    // Canal water: still and dark against the snow, holding the dusk sky.
    shade(ctx, 0, vp.y, W, H - vp.y, (x, y) => {
      const d = water * focal / Math.max(1, y - vp.y);
      const X = (x - vp.x) * d / focal - bend(d);
      if (X < canalLeft - 0.2 || X > canalRight + 0.2 || d > 400) return null;
      const ripple = fbm(waterNoise, X * 0.8, d * 1.4, 4);
      const near = 1 - haze(d);
      const sky = lerpColor(lerpColor('#41557d', '#8293b8', smooth(0.1, 0.9, ripple + 0.5) * 0.7), '#c9b9c8', smooth(0.75, 1, ripple + 0.5) * 0.4);
      const color = lerpColor(sky, hazeColor, haze(d) * 0.9 + (1 - near) * 0.05);
      return [color[0], color[1], color[2], 1];
    }, 2);

    // Stone warehouses along the right bank.
    const warehouses = [];
    let d = 4.2;
    while (d < 260) {
      const length = 12 + rng() * 10;
      warehouses.push({ d0: d, d1: d + length, height: 7 + rng() * 2.5, tone: rng(), lit: rng() });
      d += length + 0.6;
    }
    const facadeX = 11.5;
    const reflections = [];
    for (const house of warehouses.slice().reverse()) {
      const top = walk - house.height;
      const fade = haze(house.d0);
      const corners = [P(facadeX, walk, house.d0), P(facadeX, walk, house.d1), P(facadeX, top, house.d1), P(facadeX, top, house.d0)];
      const wall = ctx.createLinearGradient(corners[0][0], 0, corners[1][0], 0);
      wall.addColorStop(0, rgba(lerpColor(lerpColor('#8e8a8c', '#a08f7e', house.tone), hazeColor, fade)));
      wall.addColorStop(1, rgba(lerpColor('#6d6d78', hazeColor, fade)));
      p.polygon(corners, wall);
      // Stone courses.
      ctx.strokeStyle = rgba('#4d4c56', 0.35 * (1 - fade));
      ctx.lineWidth = Math.max(0.4, 0.9 * focal / house.d0 / 200);
      for (let course = 0.6; course < house.height; course += 0.6) {
        ctx.beginPath(); ctx.moveTo(...P(facadeX, walk - course, house.d0)); ctx.lineTo(...P(facadeX, walk - course, house.d1)); ctx.stroke();
      }
      // Arched windows, some lit from inside.
      const bays = Math.max(2, Math.round((house.d1 - house.d0) / 3.6));
      for (let bay = 0; bay < bays; bay++) {
        const center = house.d0 + (house.d1 - house.d0) * (bay + 0.5) / bays;
        for (const floor of [1.4, 4.6]) {
          if (floor > house.height - 1.6) continue;
          const lit = ((bay * 7 + floor * 3 + Math.floor(house.lit * 10)) % 5) < 2;
          const quad = [P(facadeX, walk - floor, center - 0.6), P(facadeX, walk - floor, center + 0.6), P(facadeX, walk - floor - 1.9, center + 0.6), P(facadeX, walk - floor - 1.9, center - 0.6)];
          const color = lit ? lerpColor('#ffc277', hazeColor, fade * 0.6) : lerpColor('#3f4352', hazeColor, fade);
          p.polygon(quad, rgba(color, 0.95));
          const [ax, ay] = P(facadeX, walk - floor - 1.9, center);
          const r = 0.6 * focal / center;
          ctx.fillStyle = rgba(color, 0.95);
          ctx.beginPath(); ctx.ellipse(ax, ay, Math.max(0.5, Math.abs(quad[1][0] - quad[0][0]) / 2), r * 0.6, 0, Math.PI, 0); ctx.fill();
          // Snow piled on each sill.
          ctx.fillStyle = rgba(lerpColor('#f7f9ff', hazeColor, fade * 0.5), 0.95);
          const [sx, sy] = P(facadeX, walk - floor + 0.02, center);
          ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(0.6, Math.abs(quad[1][0] - quad[0][0]) * 0.62), Math.max(0.5, r * 0.18), 0, Math.PI, 0); ctx.fill();
          if (lit) {
            const [gx, gy] = P(facadeX, walk - floor - 0.9, center);
            p.glow(gx, gy, r * 3, '#ffb060', 0.22 * (1 - fade * 0.5));
            reflections.push({ X: facadeX, Y: walk - floor - 0.9, d: center, color: '#ffb066', strength: 0.5 });
          }
        }
      }
      // Ivy darkening the lower walls of some warehouses.
      if (house.tone > 0.45) {
        shade(ctx, Math.min(corners[0][0], corners[1][0]), Math.min(corners[2][1], corners[3][1]), Math.abs(corners[1][0] - corners[0][0]) + 1, Math.abs(corners[0][1] - corners[3][1]) + 1, (x, y) => {
          let dd = focal * facadeX / Math.max(1, x - vp.x);
          for (let pass = 0; pass < 4; pass++) dd = focal * (facadeX + bend(dd)) / Math.max(1, x - vp.x);
          if (!(dd >= house.d0 && dd <= house.d1)) return null;
          const Y = (y - vp.y) * dd / focal;
          if (Y < top || Y > walk) return null;
          const n = fbm(stoneNoise, dd * 0.4, Y * 0.6, 3);
          return [72, 70, 78, smooth(0.0, 0.3, n + (Y - top) / house.height * 0.4 - 0.25) * 0.5 * (1 - fade)];
        }, 2);
      }
      // Deep snow on the eaves and the roof slope.
      const ridge = top - 3.2;
      p.polygon([P(facadeX, top, house.d0), P(facadeX, top, house.d1), P(facadeX + 6, ridge, house.d1), P(facadeX + 6, ridge, house.d0)], rgba(lerpColor('#e9eef8', hazeColor, fade * 0.7)));
      p.polygon([P(facadeX - 0.4, top + 0.05, house.d0), P(facadeX - 0.4, top + 0.05, house.d1), P(facadeX - 0.4, top - 0.55, house.d1), P(facadeX - 0.4, top - 0.55, house.d0)], rgba(lerpColor('#ffffff', hazeColor, fade * 0.6)));
      p.polygon([P(facadeX - 0.4, top + 0.05, house.d0), P(facadeX - 0.4, top + 0.05, house.d1), P(facadeX - 0.4, top + 0.25, house.d1), P(facadeX - 0.4, top + 0.25, house.d0)], rgba(lerpColor('#aab6d0', hazeColor, fade * 0.7), 0.8));
      // Snowbank on the walkway.
      p.polygon([P(facadeX, walk, house.d0), P(facadeX, walk, house.d1), P(facadeX - 1.4, walk + 0.02, house.d1), P(facadeX - 1.4, walk + 0.02, house.d0)], rgba(lerpColor('#e2e8f4', hazeColor, fade * 0.7)));
    }

    // Walkways: fresh snow along both banks, with the canal's stone edge.
    for (const [x0, x1] of [[canalRight, facadeX - 1.4], [-14, canalLeft]]) {
      shade(ctx, 0, vp.y, W, H - vp.y, (x, y) => {
        const dd = walk * focal / Math.max(1, y - vp.y);
        const X = (x - vp.x) * dd / focal - bend(dd);
        if (X < x0 || X > x1 || dd < 2.5 || dd > 400) return null;
        const n = fbm(snowNoise, X * 0.5, dd * 0.5, 4);
        const footprints = smooth(0.35, 0.55, fbm(snowNoise, X * 3 + 9, dd * 2.2, 2)) * 0.22;
        const color = lerpColor(lerpColor('#c9d2e6', '#fbfcff', 0.55 + n * 0.6 - footprints), hazeColor, haze(dd) * 0.8);
        return [color[0], color[1], color[2], 1];
      }, 1);
    }
    const along = [];
    for (let dd = 2.5; dd < 400; dd *= 1.04) along.push(dd);
    for (const X of [canalRight, canalLeft]) {
      p.polygon([...along.map(dd => P(X, walk, dd)), ...along.slice().reverse().map(dd => P(X, water, dd))], '#5a6178');
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); along.forEach((dd, index) => index ? ctx.lineTo(...P(X, walk, dd)) : ctx.moveTo(...P(X, walk, dd))); ctx.stroke();
    }

    // Gas lamps along both walkways, just lit.
    const lamps = [];
    for (let dd = 5; dd < 220; dd += 13) {
      lamps.push({ X: canalRight + 0.7, d: dd + 2 });
      lamps.push({ X: canalLeft - 0.7, d: dd + 8.5 });
    }
    lamps.sort((a, b) => b.d - a.d);
    for (const lamp of lamps) {
      const scale = focal / lamp.d;
      const fade = haze(lamp.d);
      const [bx, by] = P(lamp.X, walk, lamp.d);
      const [hx, hy] = P(lamp.X, walk - 3.6, lamp.d);
      ctx.strokeStyle = rgba(lerpColor('#2c3140', hazeColor, fade * 0.8));
      ctx.lineWidth = Math.max(0.8, 0.16 * scale);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
      const lampWidth = 0.32 * scale, lampHeight = 0.5 * scale;
      p.glow(hx, hy - lampHeight * 0.4, 3 * scale, '#ffb35c', 0.3 * (1 - fade * 0.5), 'source-over');
      p.glow(hx, hy - lampHeight * 0.4, 1.1 * scale, '#ffd79a', 0.55 * (1 - fade * 0.4), 'source-over');
      ctx.fillStyle = '#fff0cc';
      ctx.fillRect(hx - lampWidth / 2, hy - lampHeight, lampWidth, lampHeight);
      ctx.fillStyle = rgba(lerpColor('#2c3140', hazeColor, fade * 0.6));
      ctx.beginPath(); ctx.moveTo(hx - lampWidth * 0.8, hy - lampHeight); ctx.lineTo(hx, hy - lampHeight * 1.5); ctx.lineTo(hx + lampWidth * 0.8, hy - lampHeight); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.ellipse(hx, hy - lampHeight * 1.4, lampWidth * 0.6, lampHeight * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      const [px, py] = P(lamp.X, walk, lamp.d);
      p.ellipseGlow(px, py, 2.4 * scale, 0.5 * scale, '#ffc27a', 0.28 * (1 - fade), 'source-over');
      reflections.push({ X: lamp.X, Y: walk - 3.6, d: lamp.d, color: '#ffbc6a', strength: 1 });
    }

    // Candle globes floating on the canal, as during the snow-light festival.
    for (let index = 0; index < 46; index++) {
      const dd = 7 + Math.pow(rng(), 1.6) * 90;
      const X = canalLeft + 1 + rng() * (canalRight - canalLeft - 2);
      const [x, y] = P(X, water - 0.15, dd);
      const scale = focal / dd;
      p.glow(x, y, 0.9 * scale, '#ffb35c', 0.55 * (1 - haze(dd)), 'source-over', 0.2);
      ctx.fillStyle = rgba('#fff3d6', 0.95 * (1 - haze(dd) * 0.6));
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.8, 0.13 * scale), Math.max(0.6, 0.1 * scale), 0, 0, Math.PI * 2); ctx.fill();
      reflections.push({ X, Y: water - 0.4, d: dd, color: '#ffb35c', strength: 0.55, short: true });
    }

    // Reflections: softly broken streaks of warm light on the water.
    const shimmer = createCanvas();
    const shimmerContext = shimmer.getContext('2d');
    shimmerContext.globalCompositeOperation = 'lighter';
    for (const light of reflections) {
      const mirrorY = water + (water - light.Y);
      const X = Math.min(canalRight - 0.2, Math.max(canalLeft + 0.2, light.X));
      const [x, y] = P(X, mirrorY, light.d);
      const [, start] = P(X, water, light.d);
      const scale = focal / light.d;
      const fade = 1 - haze(light.d) * 0.7;
      const length = Math.max(6, (y - start) * (light.short ? 1.2 : 2.2));
      const lines = Math.max(6, Math.min(40, Math.round(length / 6)));
      for (let line = 0; line < lines; line++) {
        const t = line / lines;
        const dy = start + t * length;
        if (dy > H) break;
        const wobble = fbm(waterNoise, light.d * 0.3 + line * 0.37, X, 2) * 0.6 * scale;
        const width = (0.25 + 0.5 * Math.abs(fbm(waterNoise, line * 0.7, light.d, 2))) * scale * (1 + t * 0.6);
        shimmerContext.fillStyle = rgba(light.color, (0.34 - t * 0.3) * light.strength * fade);
        shimmerContext.beginPath();
        shimmerContext.ellipse(x + wobble, dy, Math.max(0.6, width / 2), Math.max(0.5, length / lines * 0.32), 0, 0, Math.PI * 2);
        shimmerContext.fill();
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'blur(1.4px)';
    ctx.drawImage(shimmer, 0, 0);
    ctx.restore();

    // Bare trees on the left bank, a line of snow resting on each branch.
    const tree = (x, y, height, seed) => {
      const treeRng = random(seed);
      const grow = (x0, y0, angle, length, width, depth) => {
        const curve = (treeRng() - 0.5) * 0.5;
        const mx = x0 + Math.cos(angle + curve) * length * 0.5, my = y0 + Math.sin(angle + curve) * length * 0.5;
        const x1 = x0 + Math.cos(angle) * length, y1 = y0 + Math.sin(angle) * length;
        ctx.strokeStyle = rgba(lerpColor('#3d4252', '#8c92a8', clamp(1 - width / 12) * 0.6)); ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
        const upward = Math.abs(Math.cos(angle));
        if (width > 1.2 && upward > 0.25) {
          ctx.strokeStyle = rgba('#ffffff', 0.55 + upward * 0.4); ctx.lineWidth = Math.max(0.8, width * 0.36);
          ctx.beginPath(); ctx.moveTo(x0, y0 - width * 0.42); ctx.quadraticCurveTo(mx, my - width * 0.42, x1, y1 - width * 0.42); ctx.stroke();
        }
        if (depth <= 0) return;
        const children = 2 + (treeRng() < 0.45 ? 1 : 0);
        for (let child = 0; child < children; child++) {
          grow(x1, y1, angle + (child - (children - 1) / 2) * (0.5 + treeRng() * 0.4) + (treeRng() - 0.5) * 0.3, length * (0.6 + treeRng() * 0.22), width * 0.64, depth - 1);
        }
      };
      grow(x, y, -Math.PI / 2 + (treeRng() - 0.5) * 0.16, height * 0.34, height * 0.045, 7);
    };
    tree(W * 0.05, H * 0.86, 760, 421);
    tree(W * 0.22, H * 0.68, 430, 422);
    tree(W * 0.33, H * 0.61, 250, 424);

    // Falling snow, finer and denser into the distance, each flake faintly
    // shadowed so it reads against the bright sky.
    for (let index = 0; index < 2200; index++) {
      const depth = rng();
      const x = rng() * W, y = rng() * H;
      const size = 0.7 + depth * depth * 5;
      const alpha = 0.35 + (1 - depth) * 0.35;
      if (size > 2.6) {
        ctx.fillStyle = rgba('#7d8cad', alpha * 0.22);
        ctx.beginPath(); ctx.arc(x + size * 0.15, y + size * 0.25, size * 1.15, 0, Math.PI * 2); ctx.fill();
        p.glow(x, y, size * 1.5, '#ffffff', alpha * 0.9, 'source-over', 0.45);
      } else { ctx.fillStyle = rgba('#ffffff', alpha); ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); }
    }
    // Snow haze down the canal.
    p.ellipseGlow(vp.x, vp.y, W * 0.3, H * 0.12, '#f4eef2', 0.28, 'screen');

    finish(ctx, rng, { grain: 3, vignette: 0.05, gamma: 1, gain: 1 });
  };

  async function paintBackdrop(theme) {
    if (!Object.hasOwn(scenes, theme)) throw new Error(`Unknown backdrop: ${theme}`);
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    scenes[theme](ctx);
    return canvas;
  }

  // Four 16:9 previews stacked vertically, in theme order, for the picker.
  // Each tile frames its artwork the way the welcome screen does: full-bleed
  // for the cities seen from the street, and through the round window on a
  // washi wall for Kyoto.
  async function paintThemePreviews(sources, frames = []) {
    const width = 288, height = 162;
    const canvas = createCanvas(width, height * sources.length);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    for (const [index, source] of sources.entries()) {
      const image = new Image();
      image.src = source;
      await image.decode();
      const y0 = index * height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, width, height);
      ctx.clip();
      if (frames[index] === 'window') {
        // Washi wall, lamplit from the upper left.
        const rng = random(0x77617368 + index);
        ctx.fillStyle = '#efede3';
        ctx.fillRect(0, y0, width, height);
        const lamp = ctx.createRadialGradient(width * 0.05, y0 - height * 0.1, 0, width * 0.05, y0 - height * 0.1, width * 0.8);
        lamp.addColorStop(0, 'rgba(255,250,236,0.9)'); lamp.addColorStop(1, 'rgba(255,250,236,0)');
        ctx.fillStyle = lamp; ctx.fillRect(0, y0, width, height);
        for (let fiber = 0; fiber < 90; fiber++) {
          ctx.strokeStyle = rgba('#7a6a50', 0.05 + rng() * 0.06); ctx.lineWidth = 0.6;
          const x = rng() * width, y = y0 + rng() * height, length = 6 + rng() * 22, angle = (rng() - 0.5) * 0.6;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
        }
        // Matches the welcome screen: 84% 22% / auto 136% inside the circle.
        const radius = height * 0.36, cx = width * 0.68, cy = y0 + height * 0.48;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e2ddcf'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(47,34,24,0.22)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
        const drawHeight = radius * 2 * 1.36, drawWidth = image.width * drawHeight / image.height;
        ctx.drawImage(image, cx - radius + (radius * 2 - drawWidth) * 0.84, cy - radius + (radius * 2 - drawHeight) * 0.22, drawWidth, drawHeight);
        const depth = ctx.createLinearGradient(0, cy - radius, 0, cy - radius + radius * 0.4);
        depth.addColorStop(0, 'rgba(16,9,6,0.55)'); depth.addColorStop(1, 'rgba(16,9,6,0)');
        ctx.fillStyle = depth; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 0.4);
        ctx.restore();
      } else {
        // Match the welcome screen's framing (cover, 75% / 30%).
        const scale = Math.max(width / image.width, height / image.height) * 1.18;
        const drawWidth = image.width * scale, drawHeight = image.height * scale;
        ctx.drawImage(image, (width - drawWidth) * 0.75, y0 + (height - drawHeight) * 0.3, drawWidth, drawHeight);
      }
      ctx.restore();
    }
    return canvas;
  }

  window.paintBackdrop = paintBackdrop;
  window.paintThemePreviews = paintThemePreviews;
})();
