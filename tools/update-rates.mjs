#!/usr/bin/env node
/*
 * Genera rates.json: todos los tipos en unidades por 1 EUR, con la fuente y la
 * fecha de cada uno. Lo ejecuta a diario el workflow de publicación.
 *
 * Fuentes, por orden de preferencia:
 *
 *   1. Tipos de referencia del BCE (~30 monedas). Los publica el BCE hacia las
 *      16:00 CET y el Banco de España los reproduce en su tabla tc_1_1, por lo
 *      general un día después. Se consultan las dos y se usa la más reciente:
 *      las cifras son las mismas.
 *   2. Dólar taiwanés: el Banco Central de Taiwán publica cada día laborable el
 *      cierre NTD/USD del mercado interbancario (16:00 en Taipéi). Ni el BCE
 *      ni el Banco de España cotizan el TWD, así que se cruza por el dólar:
 *      TWD/EUR = (NTD por USD) × (USD por EUR del BCE).
 *   3. Para las demás monedas (AED, VND, …), que no publica ninguna de las
 *      anteriores, un agregador gratuito (ExchangeRate-API). La app indica de
 *      qué fuente sale cada tipo.
 *
 * Si una fuente falla, se conservan sus tipos de la ejecución anterior (con su
 * fecha real) mientras no tengan más de una semana. Nunca se escribe un
 * fichero con menos monedas de las que tenía sin avisar.
 *
 * Uso: node tools/update-rates.mjs [ruta de rates.json]
 * Código de salida 2: no se ha podido obtener nada nuevo de ninguna fuente
 * (el fichero anterior queda intacto).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NAMES_EN } from '../currencies.js';

const UA = 'Divisas/1.0 (+https://github.com/aurgo/Divisas)';
const MAX_CARRY_DAYS = 7;
/** Una lectura de la web del Banco Central de Taiwán que se aleje más de esto del agregador se descarta: es un error de lectura, no un tipo. */
const SCRAPE_TOLERANCE = 0.05;

export const URLS = {
  ecb: 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata&detail=dataonly',
  bde: 'https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/tc_1_1.csv',
  cbc: 'https://www.cbc.gov.tw/tw/lp-645-1.html',
  agg: [
    'https://open.er-api.com/v6/latest/EUR',
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/eur.min.json',
  ],
};

const DAY = 86400000;
const daysBetween = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY;
const isRate = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/* ---------- lectores (puros, probados en test/update-rates.test.mjs) ---------- */

/** CSV del BCE (detail=dataonly): una fila por moneda con su última observación. */
export function parseEcbCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  const iCur = head.indexOf('CURRENCY'), iDate = head.indexOf('TIME_PERIOD'), iVal = head.indexOf('OBS_VALUE');
  if (iCur < 0 || iDate < 0 || iVal < 0) throw new Error('BCE: columnas inesperadas');
  const rows = lines.map((l) => l.split(',')).map((c) => ({ code: c[iCur], date: c[iDate], value: Number(c[iVal]) }))
    .filter((r) => /^[A-Z]{3}$/.test(r.code) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && isRate(r.value));
  if (!rows.length) throw new Error('BCE: sin datos');
  const date = rows.map((r) => r.date).sort().at(-1);
  const rates = {};
  // Las monedas que el BCE dejó de cotizar (ARS en 2020, RUB en 2022, BGN al entrar en el euro) traen su última fecha: fuera.
  for (const r of rows) if (daysBetween(r.date, date) <= MAX_CARRY_DAYS) rates[r.code] = r.value;
  return { date, rates };
}

const MESES = { ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06', JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12' };

function csvCells(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Tabla tc_1_1 del Banco de España: una columna por moneda (DTCCBCEUSDEUR.B…), una fila por día ("08 OCT 2026"). */
export function parseBdeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean).map(csvCells);
  const header = lines.find((c) => /C.DIGO DE LA SERIE/i.test(c[0]));
  if (!header) throw new Error('Banco de España: no encuentro la fila de códigos');
  const codes = header.map((c) => { const m = /^DTCC(?:BCE|FMI)([A-Z]{3})EUR\.B$/.exec(c.trim()); return m ? m[1] : null; });
  const data = [];
  for (const c of lines) {
    const m = /^(\d{2}) ([A-Z]{3}) (\d{4})$/.exec(c[0].trim());
    if (m && MESES[m[2]]) data.push({ date: `${m[3]}-${MESES[m[2]]}-${m[1]}`, cells: c });
  }
  if (!data.length) throw new Error('Banco de España: sin filas de datos');
  data.sort((a, b) => a.date.localeCompare(b.date));
  const date = data.at(-1).date;
  const rates = {};
  codes.forEach((code, i) => {
    if (!code) return;
    // El último valor publicado de cada moneda, si es de la última semana ("_" = sin dato ese día).
    for (let k = data.length - 1; k >= 0 && daysBetween(data[k].date, date) <= MAX_CARRY_DAYS; k--) {
      const v = Number(String(data[k].cells[i] || '').trim());
      if (isRate(v)) { rates[code] = v; break; }
    }
  });
  if (!Object.keys(rates).length) throw new Error('Banco de España: sin tipos recientes');
  return { date, rates };
}

/** Página "新臺幣/美元 銀行間收盤匯率" del Banco Central de Taiwán: filas fecha (2026/10/08) | NTD/USD. */
export function parseCbcHtml(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const found = [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map((c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length < 2) continue;
    const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(cells[0]);
    const v = Number(cells[1].replace(/,/g, ''));
    if (m && isRate(v)) found.push({ date: `${m[1]}-${m[2]}-${m[3]}`, ntdPerUsd: v });
  }
  if (!found.length) throw new Error('Banco Central de Taiwán: no encuentro la tabla NTD/USD');
  found.sort((a, b) => a.date.localeCompare(b.date));
  return found.at(-1);
}

/** Agregador: ExchangeRate-API (base EUR) o, si falla, fawazahmed0/currency-api. */
export function parseAggregator(json) {
  if (json && json.result === 'success' && json.base_code === 'EUR' && json.rates) {
    const date = new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10);
    return { date, rates: pickRates(json.rates), name: 'er-api' };
  }
  if (json && json.eur && json.date) {
    const up = {};
    for (const [k, v] of Object.entries(json.eur)) up[k.toUpperCase()] = v;
    return { date: json.date, rates: pickRates(up), name: 'currency-api' };
  }
  throw new Error('Agregador: formato desconocido');
}
const pickRates = (obj) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && isRate(v)));

/* ---------- combinación ---------- */

/**
 * Junta las fuentes en el contenido de rates.json.
 * `fetched` = { ecb, bde, cbc, agg } (cada uno el resultado de su lector, o null si falló);
 * `previous` = el rates.json anterior (o null); `today` = 'YYYY-MM-DD'.
 */
export function combine(fetched, previous, today, now = new Date().toISOString()) {
  const warnings = [];
  const known = new Set(Object.keys(NAMES_EN));
  const out = { base: 'EUR', updated: now, sources: {}, rates: {} };

  // Lo de la ejecución anterior, agrupado por fuente, por si alguna falla ahora.
  const carried = (key) => {
    if (!previous || !previous.sources || !previous.sources[key]) return null;
    const date = previous.sources[key].date;
    if (!date || daysBetween(date, today) > MAX_CARRY_DAYS) return null;
    const rates = {};
    for (const [code, [r, s]] of Object.entries(previous.rates || {})) if (s === key && isRate(r)) rates[code] = r;
    warnings.push(`${key}: no se ha podido descargar; se mantienen los tipos del ${date}`);
    return { date, rates, extra: previous.sources[key] };
  };

  // 1. Tipos de referencia del BCE, de quien los tenga más recientes.
  let officialKey = null, official = null;
  const ecb = fetched.ecb, bde = fetched.bde;
  if (ecb && (!bde || ecb.date >= bde.date)) { officialKey = 'ecb'; official = ecb; }
  else if (bde) { officialKey = 'bde'; official = bde; }
  else {
    for (const k of ['ecb', 'bde']) { const c = carried(k); if (c && (!official || c.date > official.date)) { officialKey = k; official = c; } }
  }
  if (official) {
    out.sources[officialKey] = { date: official.date };
    out.rates.EUR = [1, officialKey];
    for (const [code, r] of Object.entries(official.rates)) if (known.has(code)) out.rates[code] = [r, officialKey];
  } else warnings.push('Sin tipos del BCE ni del Banco de España');

  const agg = fetched.agg || carried('agg');

  // 2. Dólar taiwanés del Banco Central de Taiwán, cruzado por el USD/EUR oficial.
  let cbc = fetched.cbc ? { date: fetched.cbc.date, ntdPerUsd: fetched.cbc.ntdPerUsd } : null;
  if (!cbc) {
    const c = carried('cbc');
    if (c && c.extra && isRate(c.extra.ntdPerUsd)) cbc = { date: c.date, ntdPerUsd: c.extra.ntdPerUsd };
  }
  const usdPerEur = out.rates.USD && out.rates.USD[0];
  if (cbc && usdPerEur) {
    const twd = cbc.ntdPerUsd * usdPerEur;
    const ref = agg && agg.rates.TWD;
    if (ref && Math.abs(twd - ref) / ref > SCRAPE_TOLERANCE) {
      warnings.push(`cbc: TWD ${twd.toFixed(4)} se aleja más de un ${SCRAPE_TOLERANCE * 100} % del agregador (${ref}); se descarta la lectura`);
    } else {
      out.rates.TWD = [round(twd), 'cbc'];
      out.sources.cbc = { date: cbc.date, ntdPerUsd: cbc.ntdPerUsd, usdPerEurDate: official ? official.date : null };
    }
  }

  // 3. El resto, del agregador.
  if (agg) {
    let used = false;
    for (const [code, r] of Object.entries(agg.rates)) {
      if (!known.has(code) || out.rates[code]) continue;
      out.rates[code] = [r, 'agg'];
      used = true;
    }
    if (used) out.sources.agg = { date: agg.date };
  } else warnings.push('Sin agregador: sólo quedan las monedas oficiales');

  // Las oficiales se comparan con el agregador sólo para avisar: manda la oficial.
  if (agg) {
    for (const [code, [r, s]] of Object.entries(out.rates)) {
      const ref = agg.rates[code];
      if (s !== 'agg' && s !== 'cbc' && ref && Math.abs(r - ref) / ref > SCRAPE_TOLERANCE) {
        warnings.push(`${code}: ${s} ${r} y agregador ${ref} difieren más de un ${SCRAPE_TOLERANCE * 100} %`);
      }
    }
  }

  out.rates = Object.fromEntries(Object.entries(out.rates).sort(([a], [b]) => a.localeCompare(b)));
  return { file: out, warnings };
}

const round = (v) => Number(v.toPrecision(8));

/* ---------- red ---------- */

async function get(url, as = 'text') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (as === 'json') return await r.json();
    if (as === 'latin1') return new TextDecoder('latin1').decode(await r.arrayBuffer());
    return await r.text();
  } finally { clearTimeout(timer); }
}

async function attempt(label, fn) {
  try {
    const v = await fn();
    console.log(`✓ ${label}: ${v.date}${v.rates ? `, ${Object.keys(v.rates).length} monedas` : ''}${v.ntdPerUsd ? `, NTD/USD ${v.ntdPerUsd}` : ''}`);
    return v;
  } catch (e) {
    console.log(`::warning::${label}: ${e.message}`);
    return null;
  }
}

async function main() {
  const path = process.argv[2] || fileURLToPath(new URL('../rates.json', import.meta.url));
  let previous = null;
  try { previous = JSON.parse(await readFile(path, 'utf8')); } catch { previous = null; }

  const [ecb, bde, cbc, agg] = await Promise.all([
    attempt('BCE', async () => parseEcbCsv(await get(URLS.ecb))),
    attempt('Banco de España', async () => parseBdeCsv(await get(URLS.bde, 'latin1'))),
    attempt('Banco Central de Taiwán', async () => parseCbcHtml(await get(URLS.cbc))),
    attempt('Agregador', async () => {
      let last;
      for (const u of URLS.agg) { try { return parseAggregator(await get(u, 'json')); } catch (e) { last = e; } }
      throw last;
    }),
  ]);

  if (!ecb && !bde && !cbc && !agg) {
    console.log('::error::No ha respondido ninguna fuente; rates.json se queda como estaba.');
    process.exitCode = 2;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { file, warnings } = combine({ ecb, bde, cbc, agg }, previous, today);
  for (const w of warnings) console.log(`::warning::${w}`);

  const n = Object.keys(file.rates).length;
  const before = previous && previous.rates ? Object.keys(previous.rates).length : 0;
  if (n < 2 || !file.rates.USD) {
    console.log('::error::El resultado no tiene ni el dólar; rates.json se queda como estaba.');
    process.exitCode = 2;
    return;
  }
  if (n < before) console.log(`::warning::Quedan ${n} monedas; antes había ${before}.`);

  // Si los tipos no han cambiado, no se toca el fichero (ni su fecha): así no hay commits vacíos.
  if (previous && JSON.stringify(previous.rates) === JSON.stringify(file.rates) &&
      JSON.stringify(previous.sources) === JSON.stringify(file.sources)) {
    console.log(`Sin cambios (${n} monedas).`);
    return;
  }
  await writeFile(path, JSON.stringify(file, null, 1) + '\n');
  console.log(`rates.json: ${n} monedas — ${Object.entries(file.sources).map(([k, v]) => `${k} ${v.date}`).join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
