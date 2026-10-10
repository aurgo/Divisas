/*
 * Interfaz del conversor. La lógica que se puede probar sin navegador está en
 * core.js; aquí sólo hay DOM, almacenamiento, red y eventos.
 */
import {
  pressKey, isValidInput, makeFormatter, parseRatesFile, convert, flagFile,
  currencyForCountry, countriesOf, searchCurrencies, recentList, chooseCurrency, words,
} from './core.js';
import { NAMES_EN } from './currencies.js';
import { LANG, LOCALE, t, currencyName, currencyKeywords } from './i18n.js';

const THEMES = ['verde', 'azul', 'morado', 'granate', 'turquesa', 'grafito', 'claro', 'auto'];
const DEFAULT_RECENTS = ['TWD', 'EUR', 'USD', 'SGD', 'JPY', 'CAD', 'AED', 'GBP', 'CHF', 'HKD'];
const LS_STATE = 'divisas-state';
const LS_RATES = 'divisas-rates';
const LS_THEME = 'divisas-theme';
const OLD_DAYS = 3;

const $ = (id) => document.getElementById(id);
const fmt = makeFormatter(LOCALE);
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const fmtDay = (iso) => (iso ? dateFmt.format(new Date(iso + 'T12:00:00Z')) : '?');

/* ---------------- estado ---------------- */

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* lleno o bloqueado */ } },
};

let state = { from: 'TWD', to: 'EUR', input: '0', recents: DEFAULT_RECENTS.slice() };
const saved = store.get(LS_STATE);
if (saved && typeof saved === 'object') state = { ...state, ...saved };
if (!isValidInput(state.input)) state.input = '0';
if (!NAMES_EN[state.from]) state.from = 'TWD';
if (!NAMES_EN[state.to] || state.to === state.from) state.to = state.from === 'EUR' ? 'USD' : 'EUR';
if (!Array.isArray(state.recents)) state.recents = DEFAULT_RECENTS.slice();
const save = () => store.set(LS_STATE, state);

let rawRates = store.get(LS_RATES);
let rates = parseRatesFile(rawRates);

/* ---------------- textos fijos ---------------- */

document.documentElement.lang = LANG;
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });

/* ---------------- pintar ---------------- */

const amtFrom = $('amtFrom'), amtTo = $('amtTo');
const curFrom = $('curFrom'), curTo = $('curTo'), rowFrom = $('rowFrom'), rowTo = $('rowTo');
const toastEl = $('toast');

function fit(el, row, cur) {
  el.style.fontSize = '';
  const base = parseFloat(getComputedStyle(el).fontSize);
  const stretch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stretch')) || 1;
  const avail = row.clientWidth - cur.offsetWidth - base * 0.35;
  const w = el.scrollWidth * stretch;
  if (w > avail && w > 0) el.style.fontSize = Math.max(base * 0.3, base * avail / w) + 'px';
}

function render() {
  amtFrom.textContent = fmt.formatInput(state.input);
  curFrom.firstChild.textContent = state.from;
  curTo.firstChild.textContent = state.to;
  const n = parseFloat(state.input) || 0;
  amtTo.textContent = n === 0 ? '0' : fmt.formatOutput(convert(n, state.from, state.to, rates && rates.rates));
  fit(amtFrom, rowFrom, curFrom);
  fit(amtTo, rowTo, curTo);
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

/* ---------------- teclado ---------------- */

function press(k) {
  const next = pressKey(state.input, k);
  if (next === state.input) return;
  state.input = next;
  render(); save();
}

function flash(btn) {
  btn.classList.add('down');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.classList.remove('down'), 90);
}
document.querySelectorAll('.key').forEach((btn) => {
  btn.addEventListener('pointerdown', () => { btn.classList.add('down'); clearTimeout(btn._t); });
  const up = () => { clearTimeout(btn._t); btn._t = setTimeout(() => btn.classList.remove('down'), 90); };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('click', () => {
    if (navigator.vibrate) { try { navigator.vibrate(5); } catch { /* sin vibración */ } }
    press(btn.dataset.k);
  });
});

// Deslizar el dedo sobre el importe de arriba borra la última cifra.
let swipeX = null;
rowFrom.addEventListener('pointerdown', (e) => { if (!e.target.closest('.cur')) swipeX = e.clientX; });
rowFrom.addEventListener('pointerup', (e) => {
  if (swipeX !== null && Math.abs(e.clientX - swipeX) > 30) press('back');
  swipeX = null;
});

// Tocar el resultado lo copia.
amtTo.addEventListener('click', copyResult);
function copyResult() {
  const text = amtTo.textContent + ' ' + state.to;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(t('copied', { x: text })), () => toast(t('copyFailed')));
  } else toast(text);
}

document.addEventListener('keydown', (e) => {
  if (openEl) { if (e.key === 'Escape') closeOverlay(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let k = null;
  if (/^\d$/.test(e.key)) k = e.key;
  else if (e.key === '.' || e.key === ',' || e.key === 'Decimal') k = '.';
  else if (e.key === 'Backspace') k = 'back';
  else if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'c' || e.key === 'C') k = 'C';
  if (!k) return;
  e.preventDefault();
  const btn = document.querySelector('.key[data-k="' + (k === 'back' ? 'C' : k) + '"]');
  if (btn && k !== 'back') flash(btn);
  press(k);
});

/* ---------------- intercambio ---------------- */

let spin = 0;
function swap() {
  [state.from, state.to] = [state.to, state.from];
  spin += 180;
  $('swap').firstElementChild.style.transform = 'rotate(' + spin + 'deg)';
  render(); save();
}
$('swap').addEventListener('click', swap);

/* ---------------- capas ---------------- */

let openEl = null;
function openOverlay(el) {
  if (openEl) hideOverlay();
  openEl = el;
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  // Una entrada en el historial: el gesto de "atrás" de Android cierra la capa en vez de salir.
  try { history.pushState({ divisasOverlay: true }, ''); } catch { /* sin historial */ }
}
function hideOverlay() {
  if (!openEl) return;
  const el = openEl;
  openEl = null;
  el.classList.remove('open');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setTimeout(() => { if (openEl !== el) el.hidden = true; }, 160);
}
function closeOverlay() {
  if (history.state && history.state.divisasOverlay) history.back(); // popstate la oculta
  else hideOverlay();
}
window.addEventListener('popstate', hideOverlay);
document.querySelectorAll('.overlay .close').forEach((b) => b.addEventListener('click', closeOverlay));

/* ---------------- buscador de monedas ---------------- */

const picker = $('picker'), search = $('search'), list = $('list'), hint = $('hint');
let pickerTarget = 'from';
const keywordCache = {};
const info = (code) => {
  if (!keywordCache[code]) keywordCache[code] = words(currencyKeywords(code, countriesOf(code)));
  return { name: currencyName(code), keywords: keywordCache[code] };
};
const available = () => Object.keys(NAMES_EN).filter((c) => !rates || rates.rates[c] > 0);

function itemEl(code, selected) {
  const b = document.createElement('button');
  b.className = 'item';
  b.dataset.code = code;
  const img = document.createElement('img');
  img.className = 'flag';
  img.alt = '';
  img.decoding = 'async';
  img.src = 'flags/' + flagFile(code);
  img.onerror = () => {
    const s = document.createElement('span');
    s.className = 'flag';
    s.textContent = code.slice(0, 2);
    img.replaceWith(s);
  };
  const codeEl = document.createElement('span');
  codeEl.className = 'code';
  codeEl.textContent = code;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = currencyName(code);
  b.append(img, codeEl, name);
  if (selected) b.insertAdjacentHTML('beforeend', '<svg class="check" viewBox="0 0 24 19"><path d="M1.5 10 8.5 17 22.5 2"/></svg>');
  return b;
}

function renderList() {
  const current = state[pickerTarget];
  const q = search.value.trim();
  let codes;
  if (!q) {
    codes = recentList(current, state.recents, available());
    hint.textContent = t('searchHint');
  } else {
    codes = searchCurrencies(q, available(), info);
    hint.textContent = codes.length ? '' : t('noResults');
  }
  hint.hidden = !hint.textContent;
  list.replaceChildren(...codes.map((c) => itemEl(c, c === current)));
}
search.addEventListener('input', renderList);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = list.querySelector('.item'); if (first) first.click(); }
});
list.addEventListener('click', (e) => {
  const it = e.target.closest('.item');
  if (!it) return;
  setCurrency(pickerTarget, it.dataset.code);
  closeOverlay();
});
function setCurrency(target, code) {
  state = chooseCurrency(state, target, code);
  render(); save();
}
function openPicker(target) {
  pickerTarget = target;
  search.value = '';
  renderList();
  list.parentElement.scrollTop = 0;
  openOverlay(picker);
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => search.focus(), 30);
}
curFrom.addEventListener('click', () => openPicker('from'));
curTo.addEventListener('click', () => openPicker('to'));

/* ---------------- temas ---------------- */

function currentTheme() {
  const th = document.documentElement.dataset.theme;
  return THEMES.includes(th) ? th : 'verde';
}
function syncThemeColor() {
  // La barra de estado del móvil (y la ventana de la app instalada) toma el color del panel.
  const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
  document.querySelector('meta[name="theme-color"]').setAttribute('content', panel || '#4e851e');
}
function setTheme(id) {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(LS_THEME, id); } catch { /* sin almacenamiento */ }
  syncThemeColor();
  render();
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncThemeColor);

function renderThemes() {
  const cur = currentTheme();
  $('themeList').replaceChildren(...THEMES.map((id) => {
    const b = document.createElement('button');
    b.className = 'item';
    b.dataset.themeId = id;
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.dataset.theme = id; // la muestra toma los colores de su propio tema (styles.css)
    if (id === 'auto') sw.style.background = 'linear-gradient(135deg, #4e851e 0 50%, #d7e4c8 50% 100%)';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = t('themes.' + id);
    b.append(sw, label);
    if (id === cur) b.insertAdjacentHTML('beforeend', '<svg class="check" viewBox="0 0 24 19"><path d="M1.5 10 8.5 17 22.5 2"/></svg>');
    return b;
  }));
}
$('themeList').addEventListener('click', (e) => {
  const it = e.target.closest('.item');
  if (!it) return;
  setTheme(it.dataset.themeId);
  renderThemes();
  toast(t('themeSet', { name: t('themes.' + it.dataset.themeId) }), 1500);
});

/* ---------------- menú ---------------- */

const menu = $('menu');

function sourceLine(code) {
  if (!rates || code === 'EUR') return '';
  const key = rates.source[code];
  const src = rates.sources[key] || {};
  return t('sourceOf', { code, source: t('sources.' + key), d: fmtDay(src.date) });
}
function renderInfo() {
  const parts = [];
  if (rates) {
    const one = (a, b) => escapeHtml(t('rate', { a, b, v: fmt.formatOutput(convert(1, a, b, rates.rates)) }));
    parts.push('<p><b>' + one(state.from, state.to) + '</b><br><b>' + one(state.to, state.from) + '</b></p>');
    const lines = [sourceLine(state.from), sourceLine(state.to)].filter(Boolean);
    if (lines.length) parts.push('<p>' + lines.map(escapeHtml).join('<br>') + '</p>');
    if (rates.updated) parts.push('<p>' + escapeHtml(t('checked', { d: dateTimeFmt.format(new Date(rates.updated)) })) + '</p>');
  } else parts.push('<p>' + escapeHtml(t('noRates')) + '</p>');
  if (!navigator.onLine) parts.push('<p>' + escapeHtml(t('offlineNow')) + '</p>');
  $('info').innerHTML = parts.join('');
  $('themeName').textContent = t('themes.' + currentTheme());
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

$('menuBtn').addEventListener('click', () => { renderInfo(); openOverlay(menu); });
menu.addEventListener('click', (e) => {
  const it = e.target.closest('.item');
  if (!it) return;
  const act = it.dataset.act;
  if (act === 'theme') { renderThemes(); openOverlay($('themes')); return; }
  closeOverlay();
  if (act === 'refresh') loadRates(true);
  else if (act === 'copy') copyResult();
  else if (act === 'swap') swap();
  else if (act === 'locate') locate();
  else if (act === 'install') install();
  else if (act === 'install-ios') toast(t('installIosHow'), 5000);
});

/* ---------------- tipos de cambio ---------------- */

/*
 * rates.json lo publica cada día una tarea de GitHub (tools/update-rates.mjs).
 * Se pide siempre a la red; si no hay, el service worker devuelve la última
 * copia, y si tampoco, se queda lo guardado en localStorage.
 */
let loading = null;
function loadRates(manual) {
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch('rates.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      const parsed = parseRatesFile(json);
      if (!parsed) throw new Error('rates.json no válido');
      const changed = !rawRates || rawRates.updated !== json.updated;
      rawRates = json;
      rates = parsed;
      store.set(LS_RATES, json);
      render();
      if (manual) toast(navigator.onLine ? t(changed ? 'ratesUpdated' : 'ratesSame') : t('offlineCached'));
      return true;
    } catch {
      if (manual || !rates) toast(rates ? t('offlineCached') : t('noRates'), 3000);
      return false;
    }
  })().finally(() => { loading = null; });
  return loading;
}

function warnIfOld() {
  if (!rates || navigator.onLine) return;
  const dates = [state.from, state.to].filter((c) => c !== 'EUR')
    .map((c) => (rates.sources[rates.source[c]] || {}).date).filter(Boolean).sort();
  if (!dates.length) return;
  const age = (Date.now() - new Date(dates[0] + 'T12:00:00Z').getTime()) / 86400000;
  if (age > OLD_DAYS) toast(t('oldRates', { d: fmtDay(dates[0]) }), 3500);
}

window.addEventListener('online', () => loadRates());
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadRates(); });

/* ---------------- ubicación ---------------- */

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('sin geolocalización'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 60000 });
  });
}
async function fetchJSON(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function locate() {
  const btn = $('locate');
  if (btn.classList.contains('busy')) return;
  if (!navigator.onLine) { toast(t('locateOffline')); return; }
  btn.classList.add('busy');
  toast(t('locating'), 10000);
  let cc = null;
  try {
    const p = await getPosition();
    const j = await fetchJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
      p.coords.latitude + '&longitude=' + p.coords.longitude + '&localityLanguage=en');
    cc = j.countryCode;
  } catch { /* sin permiso o sin GPS: se prueba por la IP */ }
  if (!cc) {
    try { cc = (await fetchJSON('https://get.geojs.io/v1/ip/country.json')).country; } catch { /* nada */ }
  }
  btn.classList.remove('busy');
  const code = cc && currencyForCountry(cc, available());
  if (!code) { toast(t('locateFailed')); return; }
  if (state.from !== code) setCurrency('from', code);
  toast(t('located', { code, name: currencyName(code) }));
}
$('locate').addEventListener('click', locate);

/* ---------------- instalación ---------------- */

let installPrompt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  menu.querySelector('[data-act="install"]').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  menu.querySelector('[data-act="install"]').hidden = true;
});
async function install() {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch { /* cancelado */ }
  installPrompt = null;
  menu.querySelector('[data-act="install"]').hidden = true;
}
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIos && !standalone()) menu.querySelector('[data-act="install-ios"]').hidden = false;

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) toast(t('newVersion'), 4000);
      });
    });
  }).catch(() => { /* sin service worker: la app funciona igual, sólo que no sin conexión */ });
}

/* ---------------- arranque ---------------- */

window.addEventListener('resize', render);
syncThemeColor();
render();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
loadRates().then((ok) => { if (!ok) warnIfOld(); });
