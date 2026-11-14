const { canonicalIds, getTitle, isValidTitle, normalizeTitle, TITLE_LIMIT } = require('./meal');

function encodeTitle(title) {
  // ASCII and URL-safe even when WeChat reinterprets percent escapes on launch.
  return Array.from(title, (letter) => letter.codePointAt(0).toString(36)).join('.');
}

function decodeTitle(value) {
  if (value === '' || value === undefined) return '';
  if (typeof value !== 'string' || value.length > TITLE_LIMIT * 5 ||
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

function readSharedMenu(query) {
  const { d: date, m: meal, i: ids, t: encodedTitle } = query;
  if (!isValidDate(date) || !['lunch', 'dinner'].includes(meal) ||
      typeof ids !== 'string' || !/^[mv]\d(?:\.[mv]\d){0,15}$/.test(ids)) return null;
  const incoming = ids.split('.');
  const dishIds = canonicalIds(incoming);
  const title = decodeTitle(encodedTitle);
  if (dishIds.length !== incoming.length || title === null) return null;
  return { date, meal, title, dishIds };
}

function shareMenu(menu) {
  const ids = menu.dishIds.join('.');
  const title = encodeTitle(menu.title);
  return {
    title: getTitle(menu),
    path: `/pages/menu/index?d=${menu.date}&m=${menu.meal}&i=${ids}&t=${title}`,
    imageUrl: '/assets/brand/share.jpg',
  };
}

function menuFingerprint(menu) {
  return JSON.stringify([menu.date, menu.meal, menu.title, canonicalIds(menu.dishIds)]);
}

module.exports = { readSharedMenu, shareMenu, menuFingerprint };
