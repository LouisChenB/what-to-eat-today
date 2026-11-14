const ORDER_URL = '/pages/order/index';

function getNavigationLayout() {
  const { platform } = wx.getDeviceInfo();
  if (platform === 'windows' || platform === 'mac') {
    return { height: 44, center: 22, coverInset: 0 };
  }

  const { statusBarHeight = 0 } = wx.getWindowInfo();
  const { top, bottom, height } = wx.getMenuButtonBoundingClientRect();
  if (!(height > 0 && top >= statusBarHeight)) {
    return { height: statusBarHeight + 44, center: statusBarHeight + 22, coverInset: statusBarHeight + 44 };
  }
  const navigationHeight = Math.max(statusBarHeight + 44, bottom + top - statusBarHeight);
  return { height: navigationHeight, center: top + height / 2, coverInset: navigationHeight };
}

function goBack() {
  if (getCurrentPages().length > 1) {
    wx.navigateBack();
  } else {
    wx.reLaunch({ url: ORDER_URL });
  }
}

module.exports = { ORDER_URL, getNavigationLayout, goBack };
