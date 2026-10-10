import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEcbCsv, parseBdeCsv, parseCbcHtml, parseAggregator, combine } from '../tools/update-rates.mjs';

// Fragmentos reales de las fuentes, descargados el 10 de octubre de 2026.
const fixture = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('BCE: última fecha y fuera las monedas que ya no cotiza', () => {
  const { date, rates } = parseEcbCsv(fixture('ecb.csv'));
  assert.equal(date, '2026-10-09');
  assert.equal(rates.USD, 1.1206);
  assert.equal(rates.JPY, 177.34);
  assert.equal(rates.ARS, undefined, 'ARS dejó de cotizar en 2020');
  assert.equal(rates.RUB, undefined, 'RUB dejó de cotizar en 2022');
  assert.equal(rates.BGN, undefined, 'BGN dejó de cotizar al entrar Bulgaria en el euro');
});

test('Banco de España: fechas en español y "_" = el último valor anterior', () => {
  const { date, rates } = parseBdeCsv(fixture('bde.csv'));
  assert.equal(date, '2026-10-08');
  assert.equal(rates.USD, 1.1186);
  assert.equal(rates.GBP, 0.84698);
  assert.equal(rates.XDR, 0.827, 'el 8 de octubre no hay XDR: vale el del 7');
});

test('Banco Central de Taiwán: el cierre más reciente', () => {
  assert.deepEqual(parseCbcHtml(fixture('cbc.html')), { date: '2026-10-08', ntdPerUsd: 31.875 });
  assert.throws(() => parseCbcHtml('<html><body>mantenimiento</body></html>'), /NTD\/USD/);
});

test('Agregador: los dos formatos', () => {
  const a = parseAggregator({ result: 'success', base_code: 'EUR', time_last_update_unix: 1791590551, rates: { USD: 1.12, TWD: 35.8, AED: 4.11, btc: 1 } });
  assert.equal(a.date, '2026-10-10');
  assert.deepEqual(a.rates, { USD: 1.12, TWD: 35.8, AED: 4.11 });
  const b = parseAggregator({ date: '2026-10-10', eur: { usd: 1.12, aed: 4.11 } });
  assert.deepEqual(b.rates, { USD: 1.12, AED: 4.11 });
});

const ecb = { date: '2026-10-09', rates: { USD: 1.1206, JPY: 177.34, GBP: 0.84763 } };
const bde = { date: '2026-10-08', rates: { USD: 1.1186, JPY: 177.05, GBP: 0.84698 } };
const cbc = { date: '2026-10-08', ntdPerUsd: 31.875 };
const agg = { date: '2026-10-10', rates: { USD: 1.121, JPY: 177.5, GBP: 0.848, TWD: 35.77, AED: 4.1159, ZZZ: 3 } };

test('combinar: el BCE manda si es más reciente; TWD por el dólar; el resto, del agregador', () => {
  const { file, warnings } = combine({ ecb, bde, cbc, agg }, null, '2026-10-10', 'T');
  assert.deepEqual(warnings, []);
  assert.deepEqual(file.rates.EUR, [1, 'ecb']);
  assert.deepEqual(file.rates.USD, [1.1206, 'ecb']);
  assert.deepEqual(file.rates.TWD, [Number((31.875 * 1.1206).toPrecision(8)), 'cbc']);
  assert.deepEqual(file.rates.AED, [4.1159, 'agg']);
  assert.equal(file.rates.ZZZ, undefined, 'sólo monedas conocidas');
  assert.deepEqual(file.sources, {
    ecb: { date: '2026-10-09' },
    cbc: { date: '2026-10-08', ntdPerUsd: 31.875, usdPerEurDate: '2026-10-09' },
    agg: { date: '2026-10-10' },
  });
});

test('combinar: si el Banco de España tiene un día más, se usa el suyo', () => {
  const { file } = combine({ ecb, bde: { ...bde, date: '2026-10-10' }, cbc, agg }, null, '2026-10-10', 'T');
  assert.deepEqual(file.rates.USD, [1.1186, 'bde']);
  assert.ok(file.sources.bde && !file.sources.ecb);
});

test('combinar: una lectura absurda de la web de Taiwán se descarta', () => {
  const { file, warnings } = combine({ ecb, bde, cbc: { date: '2026-10-08', ntdPerUsd: 3.1875 }, agg }, null, '2026-10-10', 'T');
  assert.deepEqual(file.rates.TWD, [35.77, 'agg']);
  assert.match(warnings.join(' '), /cbc: TWD/);
});

test('combinar: si una fuente falla se conservan sus tipos anteriores, con su fecha', () => {
  const previous = combine({ ecb, bde, cbc, agg }, null, '2026-10-09', 'T').file;
  const { file, warnings } = combine({ ecb: null, bde: null, cbc: null, agg }, previous, '2026-10-12', 'T2');
  assert.deepEqual(file.rates.USD, [1.1206, 'ecb']);
  assert.equal(file.sources.ecb.date, '2026-10-09');
  assert.deepEqual(file.rates.TWD, previous.rates.TWD);
  assert.equal(file.sources.cbc.date, '2026-10-08');
  assert.ok(warnings.some((w) => w.startsWith('ecb:')));
});

test('combinar: lo anterior caduca a la semana y entonces manda el agregador', () => {
  const previous = combine({ ecb, bde, cbc, agg }, null, '2026-10-09', 'T').file;
  const { file } = combine({ ecb: null, bde: null, cbc: null, agg }, previous, '2026-10-20', 'T2');
  assert.deepEqual(file.rates.USD, [1.121, 'agg']);
  assert.deepEqual(file.rates.TWD, [35.77, 'agg']);
  assert.equal(file.rates.EUR, undefined, 'sin fuente oficial no hay EUR explícito: la app lo pone a 1');
});
