const categories = [
  { id: 'meat', name: '荤菜' },
  { id: 'vegetables', name: '蔬菜' },
];

// The short IDs are stored in menus and share codes. Keep them unique and stable.
const dishes = [
  ['m1', 'meat', 'cola-wings', '可乐鸡翅'],
  ['m2', 'meat', 'sweet-sour-ribs', '糖醋排骨'],
  ['m3', 'meat', 'stir-fried-beef', '小炒黄牛肉'],
  ['m4', 'meat', 'cumin-lamb', '孜然羊肉'],
  ['m5', 'meat', 'shrimp-eggs', '虾仁炒蛋'],
  ['m6', 'meat', 'pepper-pork', '辣椒炒肉'],
  ['m7', 'meat', 'red-braised-pork', '红烧肉'],
  ['m8', 'meat', 'steamed-sea-bass', '清蒸鲈鱼'],
  ['v1', 'vegetables', 'oyster-lettuce', '蚝油生菜'],
  ['v2', 'vegetables', 'green-pepper-eggs', '青椒炒蛋'],
  ['v3', 'vegetables', 'onion-eggs', '洋葱炒鸡蛋'],
  ['v4', 'vegetables', 'tomato-eggs', '番茄炒蛋'],
  ['v5', 'vegetables', 'sour-potatoes', '酸辣土豆丝'],
  ['v6', 'vegetables', 'torn-cabbage', '手撕包菜'],
  ['v7', 'vegetables', 'garlic-broccoli', '蒜蓉西兰花'],
  ['v8', 'vegetables', 'di-san-xian', '地三鲜'],
].map(([id, category, slug, name]) => ({
  id,
  category,
  slug,
  name,
  photo: `/assets/dishes/${slug}.jpg`,
  detailUrl: `/${category}/pages/detail/index?id=${id}`,
}));

const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

function groupDishes(ids) {
  const selected = new Set(ids);
  return categories.map((category) => ({
    ...category,
    dishes: dishes.filter((dish) => dish.category === category.id && selected.has(dish.id)),
  })).filter((group) => group.dishes.length > 0);
}

module.exports = { categories, dishes, dishById, groupDishes };
