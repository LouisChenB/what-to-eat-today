const { dishById } = require('../../data/dishes');
const { getDateLabel, getTitle } = require('../../lib/meal');
const { readState } = require('../../lib/store');

Page({
  data: { entries: [] },

  onShow() {
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
});
