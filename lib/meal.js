const { categories, dishes } = require('../data/dishes');

const TITLE_LIMIT = 30;

function getMealPeriod(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${month}-${day}`,
    meal: now.getHours() < 16 ? 'lunch' : 'dinner',
  };
}

function getDateLabel(date, showYear = true) {
  const [year, month, day] = date.split('-').map(Number);
  return `${showYear ? `${year}年` : ''}${month}月${day}日`;
}

function getMealLabel(meal) {
  return meal === 'lunch' ? '午餐' : '晚餐';
}

function getTitle(menu) {
  return menu.title || `${getDateLabel(menu.date)} ${getMealLabel(menu.meal)}`;
}

function normalizeTitle(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function isValidTitle(text) {
  return Array.from(text).length <= TITLE_LIMIT && !/[\u0000-\u001F\u007F]/u.test(text);
}

function canonicalIds(ids) {
  const requested = new Set(ids);
  return dishes.filter((dish) => requested.has(dish.id)).map((dish) => dish.id);
}

function changeSelection(draft, ids, now = new Date()) {
  const dishIds = canonicalIds(ids);
  if (dishIds.length === 0) return null;
  return { ...(draft || { ...getMealPeriod(now), title: '' }), dishIds };
}

function randomPair(selectedIds, previousPair = [], random = Math.random) {
  const chosen = new Set(selectedIds);
  const pools = categories.map((category) => dishes.filter(
    (dish) => dish.category === category.id && !chosen.has(dish.id),
  ));
  const exhausted = pools.findIndex((pool) => pool.length === 0);
  if (exhausted >= 0) return { exhausted: categories[exhausted].name };

  const pairs = pools[0].flatMap((meat) => pools[1].map((vegetable) => [meat, vegetable]));
  const alternatives = pairs.filter((pair) => pair.some((dish, index) => dish.id !== previousPair[index]));
  const available = alternatives.length ? alternatives : pairs;
  return {
    pair: available[Math.floor(random() * available.length)],
    canReroll: pairs.length > 1,
  };
}

module.exports = {
  TITLE_LIMIT, getMealPeriod, getDateLabel, getMealLabel, getTitle, normalizeTitle,
  isValidTitle, canonicalIds, changeSelection, randomPair,
};
