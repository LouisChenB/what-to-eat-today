const { canonicalIds, isValidTitle, normalizeTitle, TITLE_LIMIT } = require('./meal');

const MENU_PAGE = 'pages/menu/index';
const CODE_PREFIX = 'YZ';
const CODE_END = '~';
const MAX_CODE_LENGTH = 256;

function encodeTitle(title) {
  // Keep Unicode titles in a form that can be pasted and passed through a page URL.
  return Array.from(title, (letter) => letter.codePointAt(0).toString(36)).join('.');
}

function decodeTitle(value) {
  if (value === '') return '';
  if (value.length > TITLE_LIMIT * 5 ||
      !/^[0-9a-z]{1,4}(\.[0-9a-z]{1,4})*$/.test(value)) return null;
  const codePoints = value.split('.').map((part) => parseInt(part, 36));
  if (codePoints.some((code) => code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))) {
    return null;
  }
  const title = String.fromCodePoint(...codePoints);
  return isValidTitle(title) && title === normalizeTitle(title) ? title : null;
}

function isValidDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function decodeMenuCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim();
  if (code.length > MAX_CODE_LENGTH || !code.endsWith(CODE_END)) return null;
  const fields = code.slice(0, -CODE_END.length).split('_');
  if (fields.length !== 5) return null;
  const [prefix, date, meal, ids, encodedTitle] = fields;
  if (prefix !== CODE_PREFIX || !isValidDate(date) || !['lunch', 'dinner'].includes(meal)) return null;
  const incoming = ids.split('.');
  const dishIds = canonicalIds(incoming);
  const title = decodeTitle(encodedTitle);
  if (dishIds.length !== incoming.length || title === null) return null;
  return { date, meal, title, dishIds };
}

function encodeMenuCode(menu) {
  const { date, meal, dishIds, title } = menu;
  return [CODE_PREFIX, date, meal, dishIds.join('.'), encodeTitle(title)].join('_') + CODE_END;
}

async function readClipboardMenu() {
  const { data } = await wx.getClipboardData();
  return decodeMenuCode(data);
}

function receivedMenuPath(code) {
  return `/${MENU_PAGE}?code=${code}`;
}

function openReceivedMenu(code) {
  return wx.navigateTo({ url: receivedMenuPath(code) });
}

module.exports = { MENU_PAGE, decodeMenuCode, encodeMenuCode, receivedMenuPath, openReceivedMenu, readClipboardMenu };
