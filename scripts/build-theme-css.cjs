'use strict';

// Build src/renderer/theme-colors.css from styles.css:
//   node scripts/build-theme-css.cjs          write the file
//   node scripts/build-theme-css.cjs --check  fail if it is out of date
//
// styles.css remains the single source of truth for the Tokyo edition. Every
// rule that paints a color is repeated once per city under
// :root[data-theme="<city>"], with each color moved into that city's palette in
// OKLCH. Lightness is preserved within each color family, so the contrast
// relationships tuned for Tokyo carry over to every theme. Selectors keep their
// relative specificity and order, so the themed cascade mirrors the original.
// Weather layers, backdrops and decorative details live in themes.css.
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
const palettes = {
  kyoto: {
    accent: { hue: 76, spread: 0.6, chroma: 1.06, lightness: -0.05 },
    sage: { hue: 62, spread: 0.3, chroma: 0.82 },
    cool: { hue: 338, spread: 0.35, chroma: 1.55 },
    warn: { hue: 22, spread: 1, chroma: 1.12 },
    gold: { hue: 55, spread: 1, chroma: 1.05, lightness: -0.02 },
  },
  okinawa: {
    accent: { hue: 182, spread: 0.6, chroma: 1.0, lightness: -0.04 },
    sage: { hue: 192, spread: 0.3, chroma: 0.92 },
    cool: { hue: 208, spread: 0.3, chroma: 1.85 },
    warn: { hue: 30, spread: 1, chroma: 1.08 },
    gold: { hue: 95, spread: 1, chroma: 1.0 },
  },
  hokkaido: {
    accent: { hue: 238, spread: 0.6, chroma: 0.7, lightness: -0.03 },
    sage: { hue: 252, spread: 0.3, chroma: 0.85 },
    cool: { hue: 262, spread: 0.3, chroma: 1.75 },
    warn: { hue: 28, spread: 1, chroma: 1.05 },
    gold: { hue: 82, spread: 1, chroma: 1.0 },
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
function transformHex(hex, palette) {
  const color = hexToOklch(hex);
  const name = family(color);
  if (!name) return hex.toLowerCase();
  const target = palette[name];
  const deviation = ((color.H - families[name].center + 540) % 360) - 180;
  const saturation = name === 'accent' ? Math.min(1, color.C / 0.126) : 1;
  return oklchToHex({
    L: Math.min(1, Math.max(0, color.L + (target.lightness || 0) * saturation)),
    C: color.C * target.chroma,
    H: (target.hue + deviation * target.spread + 360) % 360,
    alpha: color.alpha,
  });
}

// --------------------------------------------------------------- CSS parsing
function parse(css) {
  let index = 0;
  function skipComment() {
    if (css.startsWith('/*', index)) { index = css.indexOf('*/', index + 2) + 2; return true; }
    return false;
  }
  // Read up to (not including) one of the stop characters at nesting depth 0.
  function readUntil(stops) {
    let depth = 0, text = '';
    while (index < css.length) {
      if (skipComment()) continue;
      const char = css[index];
      if (char === '"' || char === "'") {
        const end = css.indexOf(char, index + 1);
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
      .map(({ property, value }) => `${property}:${value.replace(/#[0-9a-f]{3,8}\b/gi, hex => transformHex(hex, palette))}`);
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

module.exports = { build, palettes, transformHex, hexToOklch, oklchToHex, family, parse };
