'use strict';

// Build src/renderer/theme-colors.css from styles.css:
//   node scripts/build-theme-css.cjs          write the file
//   node scripts/build-theme-css.cjs --check  fail if it is out of date
//
// styles.css remains the single source of truth for the Tokyo edition. Every
// rule that paints a color is repeated once per city under
// :root[data-theme="<city>"], with each color moved into that city's palette in
// OKLCH. Selectors keep their relative specificity and order, so the themed
// cascade mirrors the original. Weather layers, backdrops, materials and shape
// language live in themes.css.
//
// A dark city keeps Tokyo's lightness. A light city mirrors it: Tokyo's
// background becomes the lightest surface and its text the darkest ink, along
// a straight line in OKLCH lightness. That line preserves contrast closely
// (the WCAG ratios of text, muted text and faint labels stay within about 10%
// of Tokyo's), so every hierarchy tuned for the night edition reads the same
// way in daylight. Translucent white washes become translucent ink, drop
// shadows stay shadows (only softer), and the dark ink Tokyo prints on its lime
// buttons becomes paper-white on each city's deeper accent.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'renderer', 'styles.css');
const output = path.join(root, 'src', 'renderer', 'theme-colors.css');

// Tokyo's palette falls into five families. Each city maps a family to a new
// hue (keeping a fraction of the original hue variation), scales its chroma and
// may shift its lightness. Accent shifts apply in proportion to saturation, so
// pale tints of the accent keep their readability.
const families = {
  accent: { center: 120 }, // lime controls and highlights
  sage: { center: 145 },   // softly tinted text and borders
  cool: { center: 215 },   // surfaces and backgrounds
  warn: { center: 37 },    // coral errors and destructive actions
  gold: { center: 91 },    // quota warning
};
// Tokyo's background and body text, the two ends of the mirrored scale.
const tokyoBackground = 0.15, tokyoText = 0.93;
const palettes = {
  // Washi walls and sumi ink in a lamplit machiya room; Kyoto purple
  // (kyō-murasaki) for what you press, a tea-house grey-green in the paper.
  kyoto: {
    scheme: 'light', paper: 0.968, ink: 0.235, neutral: 85, tint: [0.004, 0.012],
    shadow: { hue: 40, chroma: 0.02, lightness: 0.24, alpha: 0.42 },
    accent: { hue: 336, spread: 0.4, chroma: 0.95, lightness: 0.17 },
    sage: { hue: 70, spread: 0.3, chroma: 0.55 },
    cool: { hue: 92, spread: 0.25, chroma: 0.75 },
    warn: { hue: 30, spread: 1, chroma: 1.25 },
    gold: { hue: 70, spread: 1, chroma: 1.1, lightness: 0.08 },
  },
  // Noon over the emerald shallows: coral-sand white, deep-sea ink and a
  // turquoise you could swim in.
  okinawa: {
    scheme: 'light', paper: 0.981, ink: 0.265, neutral: 228, tint: [0.002, 0.06],
    shadow: { hue: 225, chroma: 0.05, lightness: 0.3, alpha: 0.4 },
    accent: { hue: 194, spread: 0.4, chroma: 1.2, lightness: 0.235 },
    sage: { hue: 222, spread: 0.3, chroma: 1.2 },
    cool: { hue: 205, spread: 0.25, chroma: 0.7 },
    warn: { hue: 22, spread: 1, chroma: 1.35 },
    gold: { hue: 80, spread: 1, chroma: 1.25, lightness: 0.12 },
  },
  // Snow light: blue-white frost, slate ink and the cold steel blue of Otaru
  // glass. Candle amber is kept for the decorative marks in themes.css.
  hokkaido: {
    scheme: 'light', paper: 0.972, ink: 0.26, neutral: 258, tint: [0.002, 0.035],
    shadow: { hue: 260, chroma: 0.04, lightness: 0.28, alpha: 0.36 },
    accent: { hue: 254, spread: 0.4, chroma: 0.8, lightness: 0.2 },
    sage: { hue: 248, spread: 0.3, chroma: 1.1 },
    cool: { hue: 252, spread: 0.25, chroma: 0.75 },
    warn: { hue: 24, spread: 1, chroma: 1.15 },
    gold: { hue: 70, spread: 1, chroma: 1.15, lightness: 0.1 },
  },
};
// Declarations owned by themes.css: the city artwork and the weather layer.
const skipSelector = selector => /\.rain-layer\b|\.ambient-image\b/.test(selector);
const colorProperty = property => property.startsWith('--')
  || /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-shadow|-webkit-text-stroke(-color)?|accent-color|caret-color|fill|stroke|text-decoration(-color)?|column-rule(-color)?)$/.test(property);
const rootClasses = ['platform-darwin'];

// ---------------------------------------------------------------- color math
const toLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
function hexToOklch(hex) {
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = [...digits].map(digit => digit + digit).join('');
  const value = parseInt(digits.slice(0, 6), 16);
  const alpha = digits.length === 8 ? digits.slice(6) : '';
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(channel => toLinear(channel / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360, alpha };
}
function oklchToRgb({ L, C, H }) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
function oklchToHex(color) {
  // Reduce chroma until the color fits in sRGB, keeping lightness and hue.
  let { C } = color;
  let rgb = oklchToRgb({ ...color, C });
  for (let step = 0; step < 40 && rgb.some(channel => channel < -0.0005 || channel > 1.0005); step++) {
    C *= 0.94;
    rgb = oklchToRgb({ ...color, C });
  }
  return '#' + rgb.map(channel => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, channel))))) * 255).toString(16).padStart(2, '0')).join('') + color.alpha;
}
function family({ L, C, H }) {
  if (C < 0.006) return null;
  if (H >= 15 && H < 75) return 'warn';
  if (H >= 75 && H < 105 && C >= 0.06) return 'gold';
  if (H >= 105 && H < 140 && C >= 0.055) return 'accent';
  if (H >= 95 && H < 175) return 'sage';
  return 'cool';
}
const shadowProperty = property => /^(box-shadow|text-shadow)$/.test(property);
const alphaHex = value => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
// Tokyo's lightness, mirrored for a light city: background to paper, text to ink.
const mirror = (L, palette) => palette.paper + (L - tokyoBackground) / (tokyoText - tokyoBackground) * (palette.ink - palette.paper);
function transformHex(hex, palette, property = '') {
  const color = hexToOklch(hex);
  const name = family(color);
  const light = palette.scheme === 'light';
  if (!light && !name) return hex.toLowerCase();
  if (light && shadowProperty(property) && color.L < 0.35) {
    // Shadows stay shadows: a soft, tinted ink at a lighter weight.
    const alpha = (color.alpha ? parseInt(color.alpha, 16) / 255 : 1) * palette.shadow.alpha;
    return oklchToHex({ L: palette.shadow.lightness, C: palette.shadow.chroma, H: palette.shadow.hue, alpha: alphaHex(alpha) });
  }
  if (light && property === 'color' && color.L < 0.36 && name !== 'cool' && name !== 'warn') {
    // Tokyo's dark ink on lime buttons becomes paper-white on the city's
    // deeper accent, keeping the same contrast job.
    return oklchToHex({ L: Math.min(1, palette.paper + 0.025), C: palette.tint[0], H: palette.neutral, alpha: color.alpha });
  }
  const L = light ? mirror(color.L, palette) : color.L;
  // A light city tints its neutrals by depth: barely in the paper, more in the ink.
  const depth = light ? Math.min(1, Math.max(0, (L - palette.paper) / (palette.ink - palette.paper))) : 0;
  const tint = light ? palette.tint[0] + (palette.tint[1] - palette.tint[0]) * depth : 0;
  if (!name) return oklchToHex({ L: Math.min(1, Math.max(0, L)), C: tint, H: palette.neutral, alpha: color.alpha });
  const target = palette[name];
  const deviation = ((color.H - families[name].center + 540) % 360) - 180;
  const saturation = name === 'accent' ? Math.min(1, color.C / 0.126) : 1;
  return oklchToHex({
    L: Math.min(1, Math.max(0, L + (target.lightness || 0) * saturation)),
    C: color.C * target.chroma + (name === 'cool' || name === 'sage' ? tint : 0),
    H: (target.hue + deviation * target.spread + 360) % 360,
    alpha: color.alpha,
  });
}

// --------------------------------------------------------------- CSS parsing
function parse(css) {
  let index = 0;
  // Chromium tolerates an unterminated comment or string at the end of a file;
  // resuming the scan from the start would loop forever (and hang npm test).
  const unterminated = (what, at) => new Error(`Unterminated ${what} at offset ${at} of styles.css`);
  function skipComment() {
    if (!css.startsWith('/*', index)) return false;
    const end = css.indexOf('*/', index + 2);
    if (end < 0) throw unterminated('comment', index);
    index = end + 2; return true;
  }
  // Read up to (not including) one of the stop characters at nesting depth 0.
  function readUntil(stops) {
    let depth = 0, text = '';
    while (index < css.length) {
      if (skipComment()) continue;
      const char = css[index];
      if (char === '"' || char === "'") {
        const end = css.indexOf(char, index + 1);
        if (end < 0) throw unterminated('string', index);
        text += css.slice(index, end + 1); index = end + 1; continue;
      }
      if (char === '(' || char === '[') depth++;
      if (char === ')' || char === ']') depth--;
      if (depth === 0 && stops.includes(char)) break;
      text += char; index++;
    }
    return text;
  }
  function block() {
    const nodes = [];
    while (index < css.length) {
      while (index < css.length && (/\s/.test(css[index]) || skipComment())) if (/\s/.test(css[index])) index++;
      if (index >= css.length || css[index] === '}') { index++; break; }
      const prelude = readUntil(['{', ';', '}']).trim();
      if (css[index] === ';') { index++; nodes.push({ type: 'statement', prelude }); continue; }
      if (css[index] === '}') { index++; break; }
      index++; // {
      if (prelude.startsWith('@')) {
        nodes.push({ type: 'at', prelude, children: /^@(-webkit-)?keyframes\b/.test(prelude) ? (skipBlock(), []) : block() });
        continue;
      }
      const body = readUntil(['}']);
      index++;
      const declarations = splitTop(body, ';').map(item => item.trim()).filter(Boolean).map(item => {
        const colon = item.indexOf(':');
        return { property: item.slice(0, colon).trim(), value: item.slice(colon + 1).trim() };
      });
      nodes.push({ type: 'rule', selector: prelude, declarations });
    }
    return nodes;
  }
  function skipBlock() {
    let depth = 1;
    while (index < css.length && depth) {
      if (skipComment()) continue;
      if (css[index] === '{') depth++;
      if (css[index] === '}') depth--;
      index++;
    }
  }
  return block();
}
function splitTop(text, separator) {
  const parts = [];
  let depth = 0, quote = null, current = '';
  for (const char of text) {
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === '"' || char === "'") quote = char;
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === separator && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

function scope(selector, theme) {
  const prefix = `:root[data-theme="${theme}"]`;
  return splitTop(selector, ',').map(part => {
    part = part.trim().replace(/\s+/g, ' ');
    if (part.startsWith(':root')) return prefix + part.slice(5);
    for (const name of rootClasses) if (part.startsWith(`.${name}`)) return prefix + part;
    return `${prefix} ${part}`;
  }).join(',');
}

function emit(nodes, theme, palette) {
  const lines = [];
  for (const node of nodes) {
    if (node.type === 'at' && /^@media\b/.test(node.prelude)) {
      const inner = emit(node.children, theme, palette);
      if (inner.length) lines.push(`${node.prelude.replace(/\s+/g, ' ')}{`, ...inner.map(line => '  ' + line), '}');
    }
    if (node.type !== 'rule' || skipSelector(node.selector)) continue;
    const declarations = node.declarations
      .filter(({ property, value }) => colorProperty(property) && (!property.startsWith('--') || /#[0-9a-f]{3,8}\b/i.test(value)))
      .map(({ property, value }) => `${property}:${value.replace(/#[0-9a-f]{3,8}\b/gi, hex => transformHex(hex, palette, property))}`);
    if (declarations.length) lines.push(`${scope(node.selector, theme)}{${declarations.join(';')}}`);
  }
  return lines;
}

function build() {
  const tree = parse(fs.readFileSync(source, 'utf8'));
  const blocks = Object.entries(palettes).map(([theme, palette]) => [`/* ${theme} */`, ...emit(tree, theme, palette)].join('\n'));
  return [
    '/* Generated by scripts/build-theme-css.cjs from styles.css. Do not edit by hand:',
    ' * change styles.css or the palettes in the script, then run',
    ' * `node scripts/build-theme-css.cjs`. npm test fails when this file is stale. */',
    ...blocks,
    '',
  ].join('\n');
}

if (require.main === module) {
  const css = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (current !== css) { console.error('theme-colors.css is out of date: run node scripts/build-theme-css.cjs'); process.exitCode = 1; }
    else console.log('theme-colors.css is up to date');
  } else {
    fs.writeFileSync(output, css);
    console.log(`Wrote ${path.relative(root, output)} (${css.length} bytes)`);
  }
}

module.exports = { build, palettes, transformHex, hexToOklch, oklchToHex, family, parse, mirror };
