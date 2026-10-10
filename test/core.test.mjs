import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pressKey, isValidInput, makeFormatter, parseRatesFile, convert, currencyForCountry,
  countriesOf, searchCurrencies, recentList, chooseCurrency, flagFile, words,
} from '../core.js';
import { NAMES_EN } from '../currencies.js';
import { currencyKeywords } from '../i18n.js';

const type = (keys, from = '0') => keys.reduce((s, k) => pressKey(s, k), from);

test('tecleo: ceros a la izquierda, una sola coma, borrar', () => {
  assert.equal(type(['0', '0', '7']), '7');
  assert.equal(type(['1', '.', '5', '.', '0']), '1.50');
  assert.equal(type(['.', '5']), '0.5');
  assert.equal(type(['1', '2', 'back']), '1');
  assert.equal(type(['1', 'back', 'back']), '0');
  assert.equal(type(['9', '9', 'C']), '0');
  assert.equal(type(Array(20).fill('9')), '9'.repeat(12), 'como mucho 12 cifras enteras');
  assert.equal(type(['1', '.', ...Array(12).fill('3')]), '1.' + '3'.repeat(8), 'como mucho 8 decimales');
  assert.ok(isValidInput('12.5') && isValidInput('0') && !isValidInput('1e5') && !isValidInput(''));
});

test('formato en español: puntos de millar siempre, coma decimal', () => {
  const f = makeFormatter('es-ES');
  assert.equal(f.formatInput('7444122'), '7.444.122');
  assert.equal(f.formatInput('2500'), '2.500');
  assert.equal(f.formatInput('12.'), '12,');
  assert.equal(f.formatInput('0.50'), '0,50');
  assert.equal(f.formatOutput(208087.6312), '208.087,63');
  assert.equal(f.formatOutput(36), '36');
  assert.equal(f.formatOutput(0.0279186), '0,02792');
  assert.equal(f.formatOutput(null), '–');
});

test('formato en inglés', () => {
  const f = makeFormatter('en-US');
  assert.equal(f.formatInput('7444122.5'), '7,444,122.5');
  assert.equal(f.formatOutput(1234.5), '1,234.50');
});

const file = {
  base: 'EUR', updated: '2026-10-10T15:40:00Z',
  sources: { ecb: { date: '2026-10-09' }, cbc: { date: '2026-10-08' } },
  rates: { EUR: [1, 'ecb'], USD: [1.1206, 'ecb'], TWD: [35.719125, 'cbc'], BAD: [-1, 'x'], lower: [1, 'x'] },
};

test('rates.json: se aceptan sólo tipos válidos, y el euro es el comodín', () => {
  const r = parseRatesFile(file);
  assert.deepEqual(Object.keys(r.rates).sort(), ['EUR', 'TWD', 'USD']);
  assert.equal(r.source.TWD, 'cbc');
  // TWD → USD pasando por el euro = el NTD/USD publicado por el Banco Central de Taiwán
  assert.ok(Math.abs(convert(31.875, 'TWD', 'USD', r.rates) - 1) < 1e-9);
  assert.ok(Math.abs(convert(100, 'EUR', 'TWD', r.rates) - 3571.9125) < 1e-9);
  assert.equal(convert(1, 'TWD', 'XXX', r.rates), null);
  assert.equal(parseRatesFile({ base: 'USD', rates: {} }), null);
  assert.equal(parseRatesFile(null), null);
});

test('país → moneda', () => {
  const avail = Object.keys(NAMES_EN);
  assert.equal(currencyForCountry('ES', avail), 'EUR');
  assert.equal(currencyForCountry('tw', avail), 'TWD');
  assert.equal(currencyForCountry('CN', avail), 'CNY', 'no el yuan extracontinental');
  assert.equal(currencyForCountry('SN', avail), 'XOF');
  assert.equal(currencyForCountry('EC', avail), 'USD');
  assert.equal(currencyForCountry('ZZ', avail), null);
  assert.equal(currencyForCountry('', avail), null);
  assert.ok(countriesOf('EUR').includes('ES'));
});

test('búsqueda: código, nombre, otro idioma y país', () => {
  const codes = Object.keys(NAMES_EN);
  const info = (c) => ({ name: NAMES_EN[c], keywords: words(currencyKeywords(c, countriesOf(c))) });
  assert.equal(searchCurrencies('usd', codes, info)[0], 'USD');
  assert.equal(searchCurrencies('yen', codes, info)[0], 'JPY');
  assert.deepEqual(searchCurrencies('yen', codes, info), ['JPY'], '"Mayen" no es "yen"');
  assert.equal(searchCurrencies('dolar estadounidense', codes, info)[0], 'USD');
  assert.ok(searchCurrencies('taiwan', codes, info).includes('TWD'));
  assert.ok(searchCurrencies('japón', codes, info).includes('JPY'));
  assert.ok(searchCurrencies('españa', codes, info).includes('EUR'));
  assert.deepEqual(searchCurrencies('zzzz', codes, info), []);
  assert.deepEqual(searchCurrencies('  ', codes, info), []);
});

test('lista sin buscar y elegir moneda', () => {
  const avail = Object.keys(NAMES_EN);
  assert.deepEqual(recentList('EUR', ['TWD', 'EUR', 'USD'], avail), ['EUR', 'TWD', 'USD']);
  const s = { from: 'TWD', to: 'EUR', input: '1', recents: ['TWD', 'EUR'] };
  assert.deepEqual(chooseCurrency(s, 'to', 'USD'), { from: 'TWD', to: 'USD', input: '1', recents: ['USD', 'TWD', 'EUR'] });
  const swapped = chooseCurrency(s, 'to', 'TWD');
  assert.equal(swapped.from, 'EUR');
  assert.equal(swapped.to, 'TWD');
});

test('banderas: todas las monedas tienen fichero', async () => {
  const { existsSync } = await import('node:fs');
  for (const c of Object.keys(NAMES_EN)) {
    assert.ok(existsSync(new URL('../flags/' + flagFile(c), import.meta.url)), c + ' → ' + flagFile(c));
  }
});
