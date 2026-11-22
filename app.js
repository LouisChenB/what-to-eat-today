const { getTitle } = require('./lib/meal');
const { MENU_PAGE, encodeMenuCode, openReceivedMenu, readClipboardMenu } = require('./lib/share');

App({
  onShow({ path, query } = {}) {
    this.canCheckClipboard = path !== MENU_PAGE || query?.code === undefined;
    return this.checkClipboardMenu();
  },

  onHide() { this.canCheckClipboard = false; },

  onOrderReady() {
    if (this.orderReady) return;
    this.orderReady = true;
    return this.checkClipboardMenu();
  },

  async checkClipboardMenu() {
    if (!this.orderReady || !this.canCheckClipboard || this.checkingClipboard) return;
    this.checkingClipboard = true;
    try {
      const { needAuthorization } = await new Promise((resolve, reject) => {
        wx.getPrivacySetting({ success: resolve, fail: reject });
      });
      if (needAuthorization || !this.canCheckClipboard) return;
      const menu = await readClipboardMenu();
      if (menu && this.canCheckClipboard) await this.suggestClipboardMenu(menu);
    } catch {
      // A background check should leave the current page usable if reading fails.
    } finally {
      this.checkingClipboard = false;
    }
  },

  rememberClipboardCode(code) { this.handledClipboardCode = code; },

  async suggestClipboardMenu(menu) {
    const code = encodeMenuCode(menu);
    if (code === this.handledClipboardCode) return;
    const { confirm } = await wx.showModal({
      title: '发现菜单分享码',
      content: getTitle(menu),
      cancelText: '稍后',
      confirmText: '查看菜单',
      confirmColor: '#302B10',
    });
    if (!this.canCheckClipboard) return;
    if (confirm) {
      try {
        await openReceivedMenu(code);
      } catch {
        wx.showToast({ title: '暂时无法打开菜单，请重试', icon: 'none' });
        return;
      }
    }
    this.rememberClipboardCode(code);
  },
});
