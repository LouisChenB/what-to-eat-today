const { dishById } = require('../../data/dishes');
const { getDateLabel, getTitle } = require('../../lib/meal');
const { readState, deleteHistoryMenu } = require('../../lib/store');

Page({
  data: { entries: [] },

  onShow() { this.refreshEntries(); },

  refreshEntries() {
    this.setData({
      entries: readState().history.map((menu) => ({
        id: menu.id,
        title: getTitle(menu),
        meta: `${menu.title ? `${getDateLabel(menu.date)} · ` : ''}${menu.dishIds.length} 道菜`,
        photo: dishById.get(menu.dishIds[0]).photo,
      })),
    });
  },

  openMenu(event) {
    wx.navigateTo({ url: `/pages/menu/index?saved=${event.currentTarget.dataset.id}` });
  },

  async deleteMenu(event) {
    if (this.deletingMenu) return;
    const { id } = event.currentTarget.dataset;
    const entry = this.data.entries.find((menu) => menu.id === id);
    if (!entry) return;

    this.deletingMenu = true;
    try {
      const { confirm } = await wx.showModal({
        title: '删除菜单？',
        content: entry.title,
        confirmText: '删除',
        confirmColor: '#9A3428',
      });
      if (!confirm) return;
      deleteHistoryMenu(id);
      this.refreshEntries();
    } catch {
      wx.showToast({ title: '菜单删除失败，请重试', icon: 'none' });
    } finally {
      this.deletingMenu = false;
    }
  },
});
