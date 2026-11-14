const { categories, dishes, dishById, groupDishes } = require('../../data/dishes');
const { changeSelection, getDateLabel, getMealLabel, getMealPeriod, randomPair } = require('../../lib/meal');
const { readState, setDraft } = require('../../lib/store');
const { getNavigationLayout } = require('../../lib/navigation');

Page({
  data: {
    categories,
    categoryLabels: { meat: '荤菜', vegetables: '素菜' },
    activeCategory: 'meat',
    dishList: [],
    scrollTarget: '',
    selectedGroups: [],
    showingSelection: false,
    headerInset: 0,
    count: 0,
    dateLabel: '',
    pair: [],
    canReroll: false,
  },

  onLoad() {
    this.setData({ headerInset: getNavigationLayout().coverInset });
  },

  onShow() {
    this.draft = readState().draft;
    this.refreshList();
  },

  onReady() { this.measureCategoryBoundary(); },

  onResize() { this.measureCategoryBoundary(); },

  measureCategoryBoundary() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.dish-scroll').boundingClientRect();
    query.select('.dish-list').boundingClientRect();
    query.select('#category-vegetables').boundingClientRect();
    query.exec(([viewport, list, vegetables]) => {
      if (!viewport || !list || !vegetables) return;
      this.vegetableScrollTop = Math.min(vegetables.top - list.top, list.height - viewport.height);
      this.updateActiveCategory(viewport.top - list.top);
    });
  },

  handleDishScroll({ detail: { scrollTop } }) {
    this.updateActiveCategory(scrollTop);
  },

  updateActiveCategory(scrollTop) {
    if (this.vegetableScrollTop === undefined) return;
    // The scroll event and the measured heading can round pixels differently.
    const activeCategory = scrollTop > 0 && scrollTop + 1 >= this.vegetableScrollTop ? 'vegetables' : 'meat';
    if (this.data.activeCategory !== activeCategory) this.setData({ activeCategory });
  },

  refreshList() {
    const { date, meal } = this.draft || getMealPeriod();
    const ids = this.draft?.dishIds || [];
    this.setData({
      dateLabel: `${getDateLabel(date, false)} · ${getMealLabel(meal)}`,
      count: ids.length,
      selectedGroups: groupDishes(ids),
      dishList: dishes.map((dish) => ({
        ...dish,
        selected: ids.includes(dish.id),
      })),
    });
  },

  jumpToCategory(event) {
    const { id } = event.currentTarget.dataset;
    if (!categories.some((category) => category.id === id)) return;

    const scrollTarget = `category-${id}`;
    this.requestedScrollTarget = scrollTarget;
    if (this.data.scrollTarget !== scrollTarget) {
      this.setData({ scrollTarget, activeCategory: id });
      return;
    }

    // Reset the anchor in the view so tapping it again can trigger a new jump.
    this.setData({ scrollTarget: '', activeCategory: id }, () => {
      if (this.requestedScrollTarget === scrollTarget) this.setData({ scrollTarget });
    });
  },

  toggleDish(event) {
    const { id } = event.detail;
    if (!dishById.has(id)) return;
    const ids = this.draft?.dishIds || [];
    this.updateSelection(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  },

  updateSelection(ids) {
    const draft = changeSelection(this.draft, ids);
    try {
      setDraft(draft);
    } catch {
      wx.showToast({ title: '草稿保存失败，请重试', icon: 'none' });
      return false;
    }
    this.draft = draft;
    this.refreshList();
    return true;
  },

  drawPair() {
    const { pair, canReroll, exhausted } = randomPair(
      this.draft?.dishIds || [],
      this.data.pair.map((dish) => dish.id),
    );
    if (exhausted) {
      wx.showToast({ title: `${exhausted}已选完`, icon: 'none' });
      return;
    }
    this.setData({ pair, canReroll });
  },

  closePair() { this.setData({ pair: [] }); },

  rerollPair() {
    if (this.data.canReroll) this.drawPair();
  },

  addPair() {
    const ids = this.draft?.dishIds || [];
    if (this.updateSelection([...ids, ...this.data.pair.map((dish) => dish.id)])) this.closePair();
  },

  keepSheetOpen() {},

  openSelection() { this.setData({ showingSelection: true }); },

  closeSelection() { this.setData({ showingSelection: false }); },

  openMenu() {
    if (this.draft) wx.navigateTo({ url: '/pages/menu/index' });
  },

  openHistory() { wx.navigateTo({ url: '/pages/history/index' }); },
});
