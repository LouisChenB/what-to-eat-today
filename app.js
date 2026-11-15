const { getTitle } = require('./lib/meal');
const { encodeMenuCode, openReceivedMenu, readClipboardMenu } = require('./lib/share');

App({
  onShow() {
    this.foreground = true;
    return this.checkClipboardMenu();
  },

  onHide() { this.foreground = false; },

  onOrderReady() {
    if (this.orderReady) return;
    this.orderReady = true;
    return this.checkClipboardMenu();
  },

  async checkClipboardMenu() {
    if (!this.orderReady || !this.foreground || this.checkingClipboard) return;
    this.checkingClipboard = true;
    try {
      const { needAuthorization } = await new Promise((resolve, reject) => {
        wx.getPrivacySetting({ success: resolve, fail: reject });
      });
      if (needAuthorization || !this.foreground) return;
      const menu = await readClipboardMenu();
      if (menu && this.foreground) await this.suggestClipboardMenu(menu);
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
