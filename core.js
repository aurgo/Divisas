/*
 * Lógica pura del conversor: sin DOM ni navegador, para poder probarla con
 * `node --test`. La interfaz (app.js) y las pruebas importan este módulo.
 */

export const MAX_INT = 12;
export const MAX_DEC = 8;

/* ---------- tecleo ---------- */

/**
 * Aplica una tecla a lo tecleado. `input` es siempre texto con punto decimal
 * ("0", "12", "12.", "12.5"); el formato local se aplica sólo al pintarlo.
 * Teclas: '0'-'9', '.', 'C' (borrar todo), 'back' (borrar la última cifra).
 */
export function pressKey(input, key) {
  let s = input;
  if (key === 'C') return '0';
  if (key === 'back') return s.length > 1 ? s.slice(0, -1) : '0';
  if (key === '.') return s.includes('.') ? s : s + '.';
  if (!/^\d$/.test(key)) return s;
  const [i, f] = s.split('.');
  if (f !== undefined) return f.length >= MAX_DEC ? s : s + key;
  if (i === '0') return key;
  return i.length >= MAX_INT ? s : s + key;
}

export const isValidInput = (s) => typeof s === 'string' && /^\d{1,12}(\.\d{0,8})?$/.test(s);

/* ---------- formato ---------- */

export function makeFormatter(locale) {
  const dec = (new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal') || { value: '.' }).value;
  let grouping = 'always';
  try { new Intl.NumberFormat(locale, { useGrouping: 'always' }).format(1); } catch { grouping = true; }
  const nf = (opts) => new Intl.NumberFormat(locale, { useGrouping: grouping, ...opts });
  const fmtInt = nf({ maximumFractionDigits: 0 });
  const fmt2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSig = nf({ maximumSignificantDigits: 4 });

  /** Lo tecleado, tal cual, con los separadores del idioma ("7444122.5" → "7.444.122,5"). */
  function formatInput(s) {
    const [i, f] = s.split('.');
    let out = fmtInt.format(Number(i));
    if (f !== undefined) out += dec + f;
    return out;
  }

  /**
   * Un resultado: dos decimales si los tiene, ninguno si es entero, y cuatro
   * cifras significativas por debajo de 1 (0,02792) para no enseñar "0,03".
   */
  function formatOutput(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    if (Math.abs(v) >= 1) {
      const r = Math.round(v * 100) / 100;
      return Number.isInteger(r) ? fmtInt.format(r) : fmt2.format(r);
    }
    return fmtSig.format(v);
  }

  return { decimal: dec, formatInput, formatOutput };
}

/* ---------- tipos de cambio ---------- */

/**
 * Lee rates.json. Todos los tipos van en unidades por 1 EUR: el euro es el
 * comodín, así cualquier par sale de dos tipos (A→EUR→B).
 * Devuelve null si el fichero no tiene la forma esperada.
 */
export function parseRatesFile(json) {
  if (!json || json.base !== 'EUR' || typeof json.rates !== 'object' || !json.rates) return null;
  const rates = {}, source = {};
  for (const [code, entry] of Object.entries(json.rates)) {
    if (!/^[A-Z]{3}$/.test(code) || !Array.isArray(entry)) continue;
    const [r, s] = entry;
    if (typeof r === 'number' && r > 0 && Number.isFinite(r)) { rates[code] = r; source[code] = s; }
  }
  if (!rates.EUR) rates.EUR = 1;
  if (Object.keys(rates).length < 2) return null;
  return { rates, source, sources: json.sources || {}, updated: json.updated || null };
}

export function convert(amount, from, to, rates) {
  if (!rates) return null;
  const a = rates[from], b = rates[to];
  return a > 0 && b > 0 ? amount / a * b : null;
}

/* ---------- monedas ---------- */

export const FLAG_OVERRIDE = { EUR: 'european_union', XAF: 'cm', XOF: 'sn', XCD: 'ag', XPF: 'pf', XDR: 'xx', XCG: 'cw', ANG: 'cw' };
export const flagFile = (code) => (FLAG_OVERRIDE[code] || code.slice(0, 2).toLowerCase()) + '.svg';

/** Países cuya moneda no empieza por su código ISO (la regla general: TW → TWD). */
export const COUNTRY_CURRENCY = {};
const assign = (cur, list) => list.split(' ').forEach((cc) => { COUNTRY_CURRENCY[cc] = cur; });
assign('EUR', 'AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK GP MQ GF RE YT PM BL MF AX');
assign('USD', 'US EC SV PA PR GU VI AS MP UM TL FM MH PW TC VG BQ IO');
assign('AUD', 'AU CX CC NF NR HM');
assign('NZD', 'NZ CK NU PN TK');
assign('DKK', 'DK GL');
assign('NOK', 'NO SJ BV');
assign('CHF', 'CH LI');
assign('GBP', 'GB GS');
assign('XAF', 'CM CF TD CG GQ GA');
assign('XOF', 'BJ BF CI GW ML NE SN TG');
assign('XCD', 'AG DM GD KN LC VC AI MS');
assign('XPF', 'PF NC WF');
assign('XCG', 'CW SX');
assign('MAD', 'EH');
assign('ILS', 'PS');
const NOT_PRIMARY = new Set(['CLF', 'CNH', 'SLL', 'ZWL', 'XDR']);

export function currencyForCountry(cc, available) {
  cc = (cc || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  if (COUNTRY_CURRENCY[cc]) return COUNTRY_CURRENCY[cc];
  return available.find((c) => c.startsWith(cc) && !NOT_PRIMARY.has(c)) ||
    available.find((c) => c.startsWith(cc)) || null;
}

/** Códigos de país que usan cada moneda, para buscar por país ("japón", "taiwan"). */
export function countriesOf(code) {
  const out = [code.slice(0, 2)];
  for (const [cc, c] of Object.entries(COUNTRY_CURRENCY)) if (c === code && !out.includes(cc)) out.push(cc);
  return out;
}

/* ---------- búsqueda ---------- */

export const normalize = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const words = (s) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Ordena las monedas que casan con la búsqueda: código exacto, código que
 * empieza igual, nombre que empieza igual, alguna palabra del nombre, y por
 * último cualquier palabra clave (nombre en el otro idioma, país…).
 * `info(code)` devuelve { name, keywords: string[] }.
 */
export function searchCurrencies(query, codes, info) {
  const q = normalize(query.trim());
  if (!q) return [];
  const qw = words(q);
  const rank = (c) => {
    const lc = c.toLowerCase();
    const { name, keywords } = info(c);
    const n = normalize(name);
    if (lc === q) return 0;
    if (lc.startsWith(q)) return 1;
    if (n.startsWith(q)) return 2;
    if (words(n).some((w) => w.startsWith(q))) return 3;
    return qw.length && qw.every((w) => keywords.some((k) => k.startsWith(w))) ? 4 : 99;
  };
  return codes.map((c) => [c, rank(c)]).filter((x) => x[1] < 99)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
}

/** Lista sin buscar: la moneda actual y las recientes, como mucho diez. */
export function recentList(current, recents, available) {
  const avail = new Set(available);
  return [...new Set([current, ...recents])].filter((c) => avail.has(c)).slice(0, 10);
}

/** Elegir una moneda en un lado; si es la del otro lado, se intercambian. */
export function chooseCurrency(state, target, code) {
  const other = target === 'from' ? 'to' : 'from';
  const next = { ...state };
  if (next[other] === code) next[other] = next[target];
  next[target] = code;
  next.recents = [...new Set([code, next[other], ...(state.recents || [])])].slice(0, 10);
  return next;
}
