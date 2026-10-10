/*
 * Genera los PNG de icons/ a partir de icons/icono.svg. Sólo hace falta al
 * cambiar el icono; necesita Playwright con Chromium:
 *   PLAYWRIGHT=/ruta/a/node_modules/playwright node tools/make-icons.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icono.svg'), 'utf8');
// Sin esquinas redondeadas: Android recorta los "maskable" y iOS redondea solo.
const square = svg.replace(' clip-path="url(#r)"', '');
// "maskable": todo lo importante dentro del círculo central del 80 %.
const maskable = square
  .replace('<g fill="#116411">', '<g transform="translate(256 256) scale(.78) translate(-256 -256)"><g fill="#116411">')
  .replace('</g>\n  </g>\n</svg>', '</g></g>\n  </g>\n</svg>');

const jobs = [
  ['icono-192.png', svg, 192],
  ['icono-512.png', svg, 512],
  ['icono-maskable-512.png', maskable, 512],
  ['icono-apple-180.png', square, 180],
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [name, source, size] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: true });
    await page.close();
    console.log(name);
  }
  await browser.close();
})();
