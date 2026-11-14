const { categories, dishById } = require('../data/dishes');
const { getRecipe } = require('../data/recipes');
const { ORDER_URL } = require('./navigation');

function dishDetail(category) {
  return {
    data: {
      dish: null,
      categoryName: categories.find((item) => item.id === category).name,
      images: [],
      steps: [],
    },

    onLoad(options) {
      const dish = dishById.get(options.id);
      if (dish?.category === category) this.setData({ dish, ...getRecipe(dish) });
    },

    openRecipePhoto(event) {
      const index = event.currentTarget.dataset.index;
      const { dish, images } = this.data;
      if (!dish || !Number.isInteger(index) || !images[index]) return;
      wx.navigateTo({ url: `/${category}/pages/recipe-photo/index?id=${dish.id}&index=${index}` });
    },

    handleRecipeImageError(event) {
      console.warn('做法缩略图加载失败', event.currentTarget.dataset.src, event.detail?.errMsg);
    },

    openOrder() { wx.reLaunch({ url: ORDER_URL }); },
  };
}

module.exports = { dishDetail };
