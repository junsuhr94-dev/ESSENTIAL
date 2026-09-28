// 앱 아이콘(PNG) 생성: Bravura 폰트의 높은음자리표(U+E050)를 Chromium으로 렌더링한다.
// 사용법: npm run icons  (Playwright + Chromium 필요)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const font = readFileSync(new URL('../node_modules/@fontsource/bravura/files/bravura-latin-400-normal.woff2', import.meta.url)).toString('base64');

// SMuFL 규약: 1em = 오선 높이(4칸), 높은음자리표의 기준점은 G(아래서 둘째) 줄.
const html = (size, radius) => {
  const em = size * 0.34;
  const top = size * 0.36;
  const left = size * 0.14;
  const right = size * 0.86;
  const lines = [0, 1, 2, 3, 4]
    .map((i) => `<line x1="${left}" x2="${right}" y1="${top + (i * em) / 4}" y2="${top + (i * em) / 4}" />`)
    .join('');
  return `
<style>
  @font-face { font-family: Bravura; src: url(data:font/woff2;base64,${font}) format('woff2'); }
  html, body { margin: 0; background: transparent; }
  svg { display: block; border-radius: ${radius}px; }
</style>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="#262a36"/><stop offset="1" stop-color="#0b0c10"/></radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <g stroke="#e8c47a" stroke-opacity=".45" stroke-width="${size * 0.008}">${lines}</g>
  <text x="${size * 0.3}" y="${top + (em * 3) / 4}" font-family="Bravura" font-size="${em}" fill="#e8c47a">\uE050</text>
  <text x="${size * 0.62}" y="${top + em / 2}" font-family="Bravura" font-size="${em}" fill="#e8c47a">\uE1D5</text>
</svg>`;
};

const browser = await chromium.launch();
for (const [file, size, radius] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['favicon-64.png', 64, 14],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, radius));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written to public/icons/');
