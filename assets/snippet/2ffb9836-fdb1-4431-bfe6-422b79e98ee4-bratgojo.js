// src/canvas/bratgojo.js
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = join(__dirname, 'assets', 'bratgojo');
const BG_LOCAL = join(ASSETS_DIR, 'Gojo.jpeg');
const FONT_LOCAL = join(ASSETS_DIR, 'Poppins.ttf');

const BRAT_IMAGE_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Brat/Gojo.jpeg';
const BRAT_FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Brat/Poppins.ttf';

const CANVAS = {
  width: 1254,
  height: 1254
};

const SAFE_ZONE = {
  a: 660,
  b: 1180,
  c: 270,
  d: 990
};

const TEXT_STYLE = {
  fontFamily: 'Poppins',
  maxFontSize: 90,
  minFontSize: 22,
  lineHeight: 1.18,
  color: '#111111',
  align: 'center'
};

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal download: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureAssets() {
  await mkdir(ASSETS_DIR, { recursive: true });
  if (!existsSync(BG_LOCAL)) {
    const buf = await downloadBuffer(BRAT_IMAGE_URL);
    await writeFile(BG_LOCAL, buf);
  }
  if (!existsSync(FONT_LOCAL)) {
    const buf = await downloadBuffer(BRAT_FONT_URL);
    await writeFile(FONT_LOCAL, buf);
  }
  GlobalFonts.registerFromPath(FONT_LOCAL, TEXT_STYLE.fontFamily);
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSafeRect(zone) {
  return {
    x: zone.c,
    y: zone.a,
    w: zone.d - zone.c,
    h: zone.b - zone.a,
    centerX: (zone.c + zone.d) / 2,
    centerY: (zone.a + zone.b) / 2
  };
}

function setFont(ctx, size) {
  ctx.font = `${size}px ${TEXT_STYLE.fontFamily}`;
}

function splitLongWord(ctx, word, maxWidth) {
  const chars = [...word];
  const parts = [];
  let current = '';
  for (const char of chars) {
    const test = current + char;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      parts.push(current);
      current = char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapParagraph(ctx, paragraph, maxWidth) {
  const words = paragraph.split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
    } else {
      const parts = splitLongWord(ctx, word, maxWidth);
      lines.push(...parts.slice(0, -1));
      current = parts.at(-1) || '';
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(ctx, text, maxWidth) {
  return text
    .split('\n')
    .flatMap(paragraph => {
      const clean = paragraph.trim();
      if (!clean) return [''];
      return wrapParagraph(ctx, clean, maxWidth);
    });
}

function fitText(ctx, text, rect) {
  for (let size = TEXT_STYLE.maxFontSize; size >= TEXT_STYLE.minFontSize; size--) {
    setFont(ctx, size);
    const lineHeight = Math.ceil(size * TEXT_STYLE.lineHeight);
    const lines = wrapText(ctx, text, rect.w);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= rect.h) {
      return { size, lines, lineHeight, totalHeight };
    }
  }
  const size = TEXT_STYLE.minFontSize;
  setFont(ctx, size);
  const lineHeight = Math.ceil(size * TEXT_STYLE.lineHeight);
  const lines = wrapText(ctx, text, rect.w);
  const maxLines = Math.max(1, Math.floor(rect.h / lineHeight));
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines && clipped.length) {
    let last = clipped[clipped.length - 1];
    while (last.length > 0 && ctx.measureText(`${last}...`).width > rect.w) {
      last = last.slice(0, -1);
    }
    clipped[clipped.length - 1] = `${last}...`;
  }
  return { size, lines: clipped, lineHeight, totalHeight: clipped.length * lineHeight };
}

function drawCenteredText(ctx, text, zone) {
  const rect = getSafeRect(zone);
  const fitted = fitText(ctx, text, rect);
  const startY = rect.y + (rect.h - fitted.totalHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  setFont(ctx, fitted.size);
  ctx.fillStyle = TEXT_STYLE.color;
  ctx.textAlign = TEXT_STYLE.align;
  ctx.textBaseline = 'top';
  fitted.lines.forEach((line, index) => {
    const y = startY + index * fitted.lineHeight;
    ctx.fillText(line, rect.centerX, y);
  });
  ctx.restore();
}

export async function generateBratGojo(text) {
  await ensureAssets();
  const inputText = normalizeText(text);
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx = canvas.getContext('2d');
  const bg = await loadImage(BG_LOCAL);
  ctx.drawImage(bg, 0, 0, CANVAS.width, CANVAS.height);
  drawCenteredText(ctx, inputText, SAFE_ZONE);
  return canvas.toBuffer('image/png');
}