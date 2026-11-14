const { categories, dishes, dishById, groupDishes } = require('../../data/dishes');
const { changeSelection, getDateLabel, getMealLabel, getMealPeriod, randomPair } = require('../../lib/meal');
const { readState, setDraft } = require('../../lib/store');
const { getNavigationLayout } = require('../../lib/navigation');

Page({
  data: {
    categories,
    active: 'meat',
    visibleDishes: [],
    selectedGroups: [],
    showingSelection: false,
    headerInset: 0,
    count: 0,
    dateLabel: '',
    pair: [],
    canReroll: false,
    scrollTarget: '',
  },

  onLoad() {
    this.setData({ headerInset: getNavigationLayout().coverInset });
  },

  onShow() {
    this.draft = readState().draft;
    this.refreshList();
  },

  refreshList() {
    const { active } = this.data;
    const { date, meal } = this.draft || getMealPeriod();
    const ids = this.draft?.dishIds || [];
    this.setData({
      dateLabel: `${getDateLabel(date, false)} · ${getMealLabel(meal)}`,
      count: ids.length,
      selectedGroups: groupDishes(ids),
      visibleDishes: dishes.filter((dish) => dish.category === active).map((dish) => ({
        ...dish,
        selected: ids.includes(dish.id),
      })),
    });
  },

  selectCategory(event) {
    const active = event.currentTarget.dataset.id;
    if (active === this.data.active) return;
    this.setData({
      active,
      scrollTarget: `${active}-start`,
    });
    this.refreshList();
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
