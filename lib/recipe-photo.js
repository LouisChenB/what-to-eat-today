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
      this.swipeStart = null;
      this.photoScale = 1;
      // The image path is the render key, so each page starts with its own zoom and position.
      this.setData({ slides: [photo], index, total: this.images.length, imageError: false });
    },

    previousPhoto() { this.showPhoto(this.data.index - 1); },

    nextPhoto() { this.showPhoto(this.data.index + 1); },

    handlePhotoScale({ currentTarget: { dataset: { src } }, detail: { scale } }) {
      if (src !== this.data.slides[0]) return;
      this.photoScale = scale;
      if (scale > 1) this.cancelSwipe();
    },

    startSwipe({ touches }) {
      this.swipeStart = this.data.total > 1 && this.photoScale === 1 && touches.length === 1
        ? touches[0]
        : null;
    },

    moveSwipe({ touches }) {
      if (touches.length > 1) this.cancelSwipe();
    },

    endSwipe({ touches, changedTouches }) {
      const start = this.swipeStart;
      this.cancelSwipe();
      if (!start || touches.length || changedTouches.length !== 1) return;
      const [end] = changedTouches;
      if (end.identifier !== start.identifier) return;
      const x = end.clientX - start.clientX;
      const y = end.clientY - start.clientY;
      if (Math.abs(x) <= 48 || Math.abs(x) < 1.5 * Math.abs(y)) return;
      if (x < 0) this.nextPhoto();
      else this.previousPhoto();
    },

    cancelSwipe() { this.swipeStart = null; },

    handleImageError(event) {
      const { src } = event.currentTarget.dataset;
      console.warn('做法大图加载失败', src, event.detail?.errMsg);
      if (src === this.data.slides[0]) this.setData({ imageError: true });
    },
  };
}

module.exports = { recipePhoto };
