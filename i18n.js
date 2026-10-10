/*
 * Textos de la interfaz en español e inglés. Se elige por el idioma del
 * teléfono: español si empieza por "es", inglés en cualquier otro caso.
 */
import { NAMES_EN } from './currencies.js';

const nav = typeof navigator !== 'undefined' ? navigator : { language: 'en' };
export const LANG = String((nav.languages && nav.languages[0]) || nav.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
/** Para los números manda el idioma del teléfono tal cual (es-ES, en-GB, zh-TW…). */
export const LOCALE = (nav.languages && nav.languages[0]) || nav.language || 'en-US';

const STR = {
  es: {
    search: 'Buscar moneda',
    searchHint: 'Busca para elegir entre más monedas',
    noResults: 'No hay ninguna moneda con ese nombre',
    menu: 'Menú',
    close: 'Cerrar',
    useLocation: 'Usar mi ubicación',
    changeCurrency: 'Cambiar moneda',
    swap: 'Intercambiar monedas',
    clear: 'Borrar',
    decimal: 'Coma decimal',
    refresh: 'Actualizar tipos de cambio',
    copy: 'Copiar resultado',
    theme: 'Tema',
    install: 'Instalar la app',
    installIos: 'Instalar en el iPhone',
    installIosHow: 'En Safari: botón Compartir y «Añadir a pantalla de inicio»',
    copied: 'Copiado: {x}',
    copyFailed: 'No se ha podido copiar',
    ratesUpdated: 'Tipos de cambio actualizados',
    ratesSame: 'Ya tienes los últimos tipos publicados',
    offlineCached: 'Sin conexión: uso los últimos tipos descargados',
    noRates: 'Sin conexión y sin tipos descargados todavía',
    oldRates: 'Tipos del {d}: no hay conexión para actualizarlos',
    locating: 'Buscando dónde estás…',
    located: 'Moneda local: {code} — {name}',
    locateFailed: 'No he podido saber dónde estás',
    locateOffline: 'Hace falta conexión para saber dónde estás',
    rate: '1 {a} = {v} {b}',
    sourceOf: '{code}: {source}, {d}',
    offlineNow: 'Ahora mismo no hay conexión.',
    checked: 'Tipos publicados el {d}',
    themeSet: 'Tema: {name}',
    sources: {
      ecb: 'Banco Central Europeo',
      bde: 'Banco de España (tipos del BCE)',
      cbc: 'Banco Central de Taiwán (NTD/USD) cruzado con el USD/EUR del BCE',
      agg: 'ExchangeRate-API (agregador, no oficial)',
    },
    themes: {
      auto: 'Automático: grafito o claro, según el sistema',
      verde: 'Verde',
      azul: 'Azul',
      morado: 'Morado',
      granate: 'Granate',
      turquesa: 'Turquesa',
      grafito: 'Grafito',
      claro: 'Claro',
    },
  },
  en: {
    search: 'Search for currency',
    searchHint: 'Search to select from more currencies',
    noResults: 'No currencies found',
    menu: 'Menu',
    close: 'Close',
    useLocation: 'Use my location',
    changeCurrency: 'Change currency',
    swap: 'Swap currencies',
    clear: 'Clear',
    decimal: 'Decimal point',
    refresh: 'Refresh exchange rates',
    copy: 'Copy result',
    theme: 'Theme',
    install: 'Install the app',
    installIos: 'Install on iPhone',
    installIosHow: 'In Safari: Share button, then “Add to Home Screen”',
    copied: 'Copied {x}',
    copyFailed: 'Could not copy',
    ratesUpdated: 'Exchange rates updated',
    ratesSame: 'You already have the latest published rates',
    offlineCached: 'Offline — using the last downloaded rates',
    noRates: 'Offline and no rates downloaded yet',
    oldRates: 'Rates from {d}: no connection to update them',
    locating: 'Finding where you are…',
    located: 'Local currency: {code} — {name}',
    locateFailed: 'Could not detect your location',
    locateOffline: 'Finding your location needs a connection',
    rate: '1 {a} = {v} {b}',
    sourceOf: '{code}: {source}, {d}',
    offlineNow: 'You are offline right now.',
    checked: 'Rates published {d}',
    themeSet: 'Theme: {name}',
    sources: {
      ecb: 'European Central Bank',
      bde: 'Bank of Spain (ECB rates)',
      cbc: 'Central Bank of Taiwan (NTD/USD) crossed with the ECB USD/EUR',
      agg: 'ExchangeRate-API (aggregator, unofficial)',
    },
    themes: {
      auto: 'Automatic: graphite or light, following the system',
      verde: 'Green',
      azul: 'Blue',
      morado: 'Purple',
      granate: 'Maroon',
      turquesa: 'Teal',
      grafito: 'Graphite',
      claro: 'Light',
    },
  },
};

const S = STR[LANG];

export function t(key, vars) {
  let s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), S);
  if (typeof s !== 'string') return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/* ---------- nombres de monedas ---------- */

const ES_OVERRIDE = {
  FOK: 'corona feroesa', GGP: 'libra de Guernsey', IMP: 'libra manesa', JEP: 'libra de Jersey',
  KID: 'dólar de Kiribati', TVD: 'dólar tuvaluano', SLL: 'leone sierraleonés (antiguo)',
  ZWL: 'dólar zimbabuense (antiguo)',
};
let curEs = null;
try { curEs = new Intl.DisplayNames(['es'], { type: 'currency' }); } catch { curEs = null; }

function nameEs(code) {
  let n = ES_OVERRIDE[code];
  if (!n && curEs) { try { n = curEs.of(code); } catch { n = null; } }
  if (!n || n === code) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function currencyName(code) {
  if (LANG === 'es') return nameEs(code) || NAMES_EN[code] || code;
  return NAMES_EN[code] || code;
}

/** Palabras con las que también se encuentra una moneda: su nombre en los dos idiomas y los países que la usan. */
export function currencyKeywords(code, countries) {
  const parts = [NAMES_EN[code] || '', nameEs(code) || ''];
  for (const lang of ['en', 'es']) {
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { dn = null; }
    if (!dn) continue;
    for (const cc of countries) {
      try { const n = dn.of(cc); if (n && n !== cc) parts.push(n); } catch { /* código sin nombre */ }
    }
  }
  return parts.join(' ');
}
