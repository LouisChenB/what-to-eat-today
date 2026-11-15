const { groupDishes } = require('../../data/dishes');
const { getDateLabel, getMealLabel, getTitle, isValidTitle, normalizeTitle, TITLE_LIMIT } = require('../../lib/meal');
const { decodeMenuCode, encodeMenuCode } = require('../../lib/share');
const { readState, saveDraft, saveReceived, setDraft } = require('../../lib/store');
const { ORDER_URL } = require('../../lib/navigation');

Page({
  data: {
    mode: '',
    groups: [],
    heading: '',
    dateLabel: '',
    titleLimit: TITLE_LIMIT,
    editing: false,
    editValue: '',
    shareCode: '',
  },

  onLoad(options) {
    if (options.code !== undefined) {
      this.renderMenu(decodeMenuCode(options.code), 'received');
      return;
    }
    const state = readState();
    if (options.saved !== undefined) {
      this.renderMenu(state.history.find((entry) => entry.id === options.saved), 'saved');
      return;
    }
    this.renderMenu(state.draft, 'draft');
  },

  renderMenu(menu, mode) {
    this.menu = menu || null;
    if (!menu) {
      this.setData({
        mode: 'invalid',
        groups: [],
        message: mode === 'received' ? '这份菜单无法打开' : '这里还没有菜单',
      });
      return;
    }
    this.setData({
      mode,
      hasDraft: mode === 'saved' && Boolean(readState().draft),
      groups: groupDishes(menu.dishIds),
      heading: menu.title || getMealLabel(menu.meal),
      customTitle: Boolean(menu.title),
      dateLabel: getDateLabel(menu.date),
      displayTitle: getTitle(menu),
    });
  },

  openTitleEditor() {
    if (this.data.mode !== 'draft') return;
    this.setData({ editing: true, editValue: this.data.displayTitle });
  },

  closeTitleEditor() { this.setData({ editing: false }); },

  updateTitleInput(event) { this.setData({ editValue: event.detail.value }); },

  commitTitle() {
    const title = normalizeTitle(this.data.editValue);
    if (!isValidTitle(title)) {
      wx.showToast({ title: `标题最多 ${TITLE_LIMIT} 个字`, icon: 'none' });
      return;
    }
    const nextMenu = {
      ...this.menu,
      title: title === getTitle({ ...this.menu, title: '' }) ? '' : title,
    };
    try {
      setDraft(nextMenu);
    } catch {
      wx.showToast({ title: '标题保存失败，请重试', icon: 'none' });
      return;
    }
    this.renderMenu(nextMenu, 'draft');
    this.closeTitleEditor();
  },

  save() {
    const { mode } = this.data;
    if (!this.menu || (mode !== 'draft' && mode !== 'received')) return;
    try {
      if (mode === 'received') {
        const { entry, added } = saveReceived(this.menu);
        this.renderMenu(entry, 'saved');
        wx.showToast({ title: added ? '已保存到历史' : '历史中已有这份菜单', icon: 'none' });
        return;
      }
      const entry = saveDraft();
      if (entry) {
        this.renderMenu(entry, 'saved');
        wx.showToast({ title: '已保存到历史', icon: 'none' });
      }
    } catch {
      wx.showToast({ title: '菜单保存失败，请重试', icon: 'none' });
    }
  },

  openOrder() { wx.reLaunch({ url: ORDER_URL }); },

  keepSheetOpen() {},

  openShareCode() {
    if (this.menu) this.setData({ shareCode: encodeMenuCode(this.menu) });
  },

  closeShareCode() { this.setData({ shareCode: '' }); },

  copyShareCode() {
    const { shareCode } = this.data;
    if (!shareCode) return;
    wx.setClipboardData({
      data: shareCode,
      success: () => getApp().rememberClipboardCode(shareCode),
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
    });
  },
});
