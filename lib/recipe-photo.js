const { dishById } = require('../data/dishes');
const { getRecipe } = require('../data/recipes');

function recipePhoto(category) {
  return {
    data: {
      slides: [],
      index: 0,
      total: 0,
      imageError: false,
    },

    onLoad({ id, index = '0' }) {
      const dish = dishById.get(id);
      if (dish?.category !== category) return;
      const { images } = getRecipe(dish);
      if (!images.length) return;
      this.images = images;
      const requestedIndex = Number(index);
      this.showPhoto(Number.isInteger(requestedIndex) && images[requestedIndex] ? requestedIndex : 0);
    },

    showPhoto(index) {
      const photo = this.images?.[index];
      if (!photo) return;
      // The image path is the render key, so each page starts with its own zoom and position.
      this.setData({ slides: [photo], index, total: this.images.length, imageError: false });
    },

    previousPhoto() { this.showPhoto(this.data.index - 1); },

    nextPhoto() { this.showPhoto(this.data.index + 1); },

    handleImageError(event) {
      if (event.currentTarget.dataset.src === this.data.slides[0]) this.setData({ imageError: true });
    },
  };
}

module.exports = { recipePhoto };
