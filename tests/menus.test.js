const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, beforeEach } = require('node:test');
const { setting: buildSettings } = require('../project.config.json');
const { categories, dishes } = require('../data/dishes');
const { getRecipe } = require('../data/recipes');
const { getMealPeriod, getTitle, changeSelection, randomPair } = require('../lib/meal');
const { decodeMenuCode, encodeMenuCode } = require('../lib/share');
const { readState, saveDraft, saveReceived, setDraft } = require('../lib/store');
const { dishDetail } = require('../lib/dish-detail');
const { getNavigationLayout, goBack } = require('../lib/navigation');

const root = path.resolve(__dirname, '..');
const sample = { date: '2026-11-14', meal: 'dinner', title: '', dishIds: ['m1', 'v1'] };
const tap = (dataset = {}) => ({ currentTarget: { dataset } });

function mount(relativePath, register = 'Page') {
  const file = require.resolve(relativePath);
  delete require.cache[file];
  let page;
  global[register] = (definition) => { page = definition; };
  try {
    require(file);
  } finally {
    delete global[register];
  }
  page.setData = (next, done) => {
    Object.assign(page.data, next);
    if (done) done();
  };
  return page;
}

let app;
beforeEach(() => {
  const storage = new Map();
  app = mount('../app', 'App');
  global.getApp = () => app;
  global.wx = {
    getStorageSync: (key) => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {},
    hideShareMenu() {},
    navigateTo() {},
    reLaunch() {},
  };
});

test('餐次使用本地时间，16:00 开始晚餐', () => {
  for (const [hour, minute, meal] of [[0, 0, 'lunch'], [15, 59, 'lunch'], [16, 0, 'dinner'], [23, 59, 'dinner']]) {
    assert.deepEqual(getMealPeriod(new Date(2026, 10, 14, hour, minute)), { date: '2026-11-14', meal });
  }
  assert.equal(getTitle(sample), '2026年11月14日 晚餐');
});

test('点菜列表先荤后素，可跨分类选菜，重新打开仍恢复草稿', () => {
  const draft = { ...sample, title: '家里的晚饭' };
  setDraft(draft);
  const page = mount('../pages/order/index');
  page.onShow();
  assert.equal(page.data.count, 2);
  assert.deepEqual(page.data.dishList.map(({ category }) => category), [
    ...Array(8).fill('meat'), ...Array(8).fill('vegetables'),
  ]);
  assert.deepEqual(page.data.dishList.filter(({ selected }) => selected).map(({ id }) => id), ['m1', 'v1']);
  page.toggleDish({ detail: { id: 'm2' } });
  page.toggleDish({ detail: { id: 'v2' } });
  const updatedDraft = { ...draft, dishIds: ['m1', 'm2', 'v1', 'v2'] };
  assert.deepEqual(readState().draft, updatedDraft);
  const reopened = mount('../pages/order/index');
  reopened.onShow();
  assert.equal(reopened.data.count, 4);
  assert.deepEqual(reopened.data.dishList.filter(({ selected }) => selected).map(({ id }) => id), updatedDraft.dishIds);
  assert.deepEqual(changeSelection(reopened.draft, ['m1', 'v1'], new Date(2026, 10, 15, 9)), draft);
});

test('分类快捷按钮可双向跳转并重复定位，保留列表和草稿', () => {
  setDraft(sample);
  const page = mount('../pages/order/index');
  page.onShow();
  const { dishList } = page.data;
  const updates = [];
  const setData = page.setData;
  page.setData = (update, done) => {
    updates.push(update);
    setData(update, done);
  };

  page.jumpToCategory(tap({ id: 'vegetables' }));
  page.jumpToCategory(tap({ id: 'meat' }));
  page.jumpToCategory(tap({ id: 'meat' }));

  assert.deepEqual(updates, [
    { scrollTarget: 'category-vegetables', activeCategory: 'vegetables' },
    { scrollTarget: 'category-meat', activeCategory: 'meat' },
    { scrollTarget: '', activeCategory: 'meat' },
    { scrollTarget: 'category-meat' },
  ]);
  assert.equal(page.data.dishList, dishList);
  assert.deepEqual(readState().draft, sample);
});

test('手动滚过分类标题时高亮双向切换', () => {
  const page = mount('../pages/order/index');
  const rects = [
    { top: 260, height: 480 },
    { top: 260, height: 1320 },
    { top: 920 },
  ];
  const query = { select: () => ({ boundingClientRect() {} }), exec: (done) => done(rects) };
  wx.createSelectorQuery = () => ({ in: () => query });
  page.onReady();

  for (const [scrollTop, expected] of [[0, 'meat'], [650, 'meat'], [660, 'vegetables'], [800, 'vegetables'], [650, 'meat']]) {
    page.handleDishScroll({ detail: { scrollTop } });
    assert.equal(page.data.activeCategory, expected);
  }

  rects[0].height = 800;
  page.onResize();
  page.handleDishScroll({ detail: { scrollTop: 520 } });
  assert.equal(page.data.activeCategory, 'vegetables');
});

test('随机结果仅包含未选菜，换一组避开上一组，确认才合并', () => {
  setDraft(sample);
  const page = mount('../pages/order/index');
  page.onShow();
  page.drawPair();
  const originalPair = page.data.pair.map(({ id }) => id);
  assert.deepEqual(page.data.pair.map(({ category }) => category), ['meat', 'vegetables']);
  assert.ok(originalPair.every((id) => !sample.dishIds.includes(id)));
  assert.deepEqual(readState().draft, sample);
  page.rerollPair();
  assert.notDeepEqual(page.data.pair.map(({ id }) => id), originalPair);
  page.addPair();
  assert.equal(readState().draft.dishIds.length, 4);
  assert.ok(sample.dishIds.every((id) => readState().draft.dishIds.includes(id)));
  assert.equal(page.data.pair.length, 0);
  assert.equal(randomPair(dishes.filter((dish) => dish.category === 'meat').map(({ id }) => id)).exhausted, '荤菜');
  assert.equal(randomPair(dishes.filter(({ id }) => !['m8', 'v8'].includes(id)).map(({ id }) => id)).canReroll, false);
});

test('已选清单按分类展示草稿，关闭清单不影响选择', () => {
  const page = mount('../pages/order/index');
  page.onShow();
  page.openSelection();
  assert.equal(page.data.showingSelection, true);
  assert.deepEqual(page.data.selectedGroups, []);
  page.closeSelection();
  setDraft(sample);
  page.onShow();
  page.openSelection();
  assert.equal(page.data.count, 2);
  assert.deepEqual(page.data.selectedGroups.map(({ dishes }) => dishes.map(({ id }) => id)), [['m1'], ['v1']]);
  page.closeSelection();
  assert.equal(page.data.showingSelection, false);
  assert.deepEqual(readState().draft, sample);
});

test('草稿可复制分享码，改名并保存后可从历史生成新快照', () => {
  setDraft(sample);
  const page = mount('../pages/menu/index');
  page.onLoad({});
  let copiedCode;
  wx.setClipboardData = ({ data, success }) => { copiedCode = data; success(); };
  page.openShareCode();
  page.copyShareCode();
  assert.deepEqual(decodeMenuCode(copiedCode), sample);
  assert.equal(app.handledClipboardCode, copiedCode);
  page.closeShareCode();
  page.openTitleEditor();
  page.updateTitleInput({ detail: { value: '  周末加餐  ' } });
  page.commitTitle();
  assert.equal(readState().draft.title, '周末加餐');
  page.save();
  assert.equal(page.data.mode, 'saved');
  assert.equal(readState().draft, null);
  assert.equal(readState().history.length, 1);
  const history = mount('../pages/history/index');
  history.onShow();
  assert.equal(history.data.entries[0].title, '周末加餐');
  const reopened = mount('../pages/menu/index');
  reopened.onLoad({ saved: history.data.entries[0].id });
  reopened.openShareCode();
  assert.deepEqual(decodeMenuCode(reopened.data.shareCode), { ...sample, title: '周末加餐' });
  assert.deepEqual(decodeMenuCode(copiedCode), sample);
});

test('本机存储写入失败后草稿仍可重试', () => {
  setDraft(sample);
  const write = wx.setStorageSync;
  wx.setStorageSync = () => { throw new Error('storage full'); };
  assert.throws(saveDraft);
  assert.deepEqual(readState().draft, sample);
  assert.deepEqual(readState().history, []);
  wx.setStorageSync = write;
  assert.deepEqual(saveDraft().dishIds, sample.dishIds);
});

test('草稿删除可取消，写入失败可重试，成功后返回空选择的点菜页', async (t) => {
  saveReceived(sample);
  setDraft({ ...sample, title: '待删除草稿' });
  const before = readState();
  const order = mount('../pages/order/index');
  order.onShow();
  const menu = mount('../pages/menu/index');
  menu.onLoad({});
  const getPages = global.getCurrentPages;
  global.getCurrentPages = () => [order, menu];
  t.after(() => {
    if (getPages) global.getCurrentPages = getPages;
    else delete global.getCurrentPages;
  });
  let returned = false;
  wx.navigateBack = () => { returned = true; order.onShow(); };
  let confirm = false;
  let dialog;
  wx.showModal = async (options) => { dialog = options; return { confirm }; };
  await menu.deleteDraft();
  assert.equal(dialog.title, '删除草稿？');
  assert.deepEqual(readState(), before);
  assert.equal(returned, false);

  confirm = true;
  let toast;
  wx.showToast = ({ title }) => { toast = title; };
  const write = wx.setStorageSync;
  wx.setStorageSync = () => { throw new Error('storage full'); };
  await menu.deleteDraft();
  assert.match(toast, /删除失败/);
  assert.deepEqual(readState(), before);
  assert.equal(menu.data.mode, 'draft');
  assert.equal(returned, false);

  wx.setStorageSync = write;
  await menu.deleteDraft();
  assert.deepEqual(readState(), { ...before, draft: null });
  assert.equal(returned, true);
  assert.equal(order.data.count, 0);
  assert.deepEqual(order.data.selectedGroups, []);
});

test('历史按记录 ID 删除，取消或写入失败时保留记录，全部删除后显示空列表', async () => {
  setDraft(sample);
  const oldest = saveDraft();
  setDraft(sample);
  const target = saveDraft();
  const newest = saveReceived({ ...sample, title: '最新菜单' }).entry;
  const draft = { ...sample, title: '本机草稿' };
  setDraft(draft);
  const before = readState();
  const history = mount('../pages/history/index');
  history.onShow();
  let confirm = false;
  let dialog;
  wx.showModal = async (options) => { dialog = options; return { confirm }; };
  const remove = (entry) => history.deleteMenu(tap({ id: entry.id }));
  await remove(target);
  assert.equal(dialog.content, getTitle(target));
  assert.deepEqual(readState(), before);

  confirm = true;
  let toast;
  wx.showToast = ({ title }) => { toast = title; };
  const write = wx.setStorageSync;
  wx.setStorageSync = () => { throw new Error('storage full'); };
  await remove(target);
  assert.match(toast, /删除失败/);
  assert.deepEqual(readState(), before);
  assert.deepEqual(history.data.entries.map(({ id }) => id), [newest.id, target.id, oldest.id]);

  wx.setStorageSync = write;
  await remove(target);
  assert.deepEqual(readState(), { ...before, history: [newest, oldest] });
  assert.deepEqual(history.data.entries.map(({ id }) => id), [newest.id, oldest.id]);
  await remove(newest);
  await remove(oldest);
  assert.deepEqual(history.data.entries, []);
  assert.deepEqual(readState(), { draft, history: [], nextId: before.nextId });
  assert.equal(saveReceived(sample).entry.id, String(before.nextId));
});

test('分享码支持默认标题、全部菜品和 Unicode 标题，并拒绝无效或截断的代码', () => {
  const menu = { ...sample, title: '我们吃饭 +&=？' + '🍚'.repeat(21), dishIds: dishes.map(({ id }) => id) };
  const code = encodeMenuCode(menu);
  const defaultCode = encodeMenuCode(sample);
  assert.deepEqual(decodeMenuCode(` \n${code}\r\n`), menu);
  assert.deepEqual(decodeMenuCode(defaultCode), sample);
  for (const invalid of [
    code.slice(0, -2), code + ' extra', code.replace('2026-11-14', '2026-02-30'),
    defaultCode.replace('m1.v1', ''), code.replace('m1.', 'm2.'), code.replace('m1.', 'm9.'),
    code.replace('dinner', 'breakfast'), defaultCode.replace('~', 'zzzz~'), '',
    encodeMenuCode({ ...sample, title: '🍚'.repeat(31) }),
  ]) {
    assert.equal(decodeMenuCode(invalid), null, invalid);
  }
});

test('草稿、历史和收件预览均可生成聊天卡片，卡片可在原菜单删除后还原并去重保存', async () => {
  const original = { ...sample, title: '周末一起吃饭 🍚', dishIds: dishes.map(({ id }) => id) };
  setDraft(original);
  const sender = mount('../pages/menu/index');
  sender.onLoad({});
  const card = sender.onShareAppMessage();
  assert.equal(card.title, original.title);
  assert.equal(card.imageUrl, sender.data.cover);
  assert.ok(fs.existsSync(path.join(root, card.imageUrl)));
  const cardUrl = new URL(card.path, 'https://example.invalid');
  assert.equal(cardUrl.pathname, '/pages/menu/index');
  assert.deepEqual(decodeMenuCode(cardUrl.searchParams.get('code')), original);

  sender.openTitleEditor();
  sender.updateTitleInput({ detail: { value: '新标题' } });
  sender.commitTitle();
  sender.save();
  assert.equal(sender.data.mode, 'saved');
  const saved = mount('../pages/menu/index');
  saved.onLoad({ saved: readState().history[0].id });
  assert.deepEqual(saved.onShareAppMessage(), sender.onShareAppMessage());
  assert.equal(saved.onShareAppMessage().title, '新标题');
  assert.notEqual(saved.onShareAppMessage().path, card.path);
  const history = mount('../pages/history/index');
  history.onShow();
  wx.showModal = async () => ({ confirm: true });
  await history.deleteMenu(tap({ id: history.data.entries[0].id }));

  const ownDraft = { ...sample, dishIds: ['m2'] };
  setDraft(ownDraft);
  const options = Object.fromEntries(cardUrl.searchParams);
  const receiver = mount('../pages/menu/index');
  receiver.onLoad(options);
  assert.equal(receiver.data.mode, 'received');
  assert.deepEqual(receiver.menu, original);
  assert.deepEqual(receiver.onShareAppMessage(), card);
  assert.deepEqual(readState().history, []);
  receiver.save();
  const reopened = mount('../pages/menu/index');
  reopened.onLoad(options);
  reopened.save();
  assert.equal(readState().history.length, 1);
  assert.deepEqual(readState().draft, ownDraft);

  let hiddenMenus;
  wx.hideShareMenu = ({ menus }) => { hiddenMenus = menus; };
  const invalid = mount('../pages/menu/index');
  invalid.onLoad({ code: 'YZ_bad' });
  assert.deepEqual(hiddenMenus, ['shareAppMessage']);
  assert.equal(invalid.data.message, '这份菜单无法打开');
  assert.equal(invalid.onShareAppMessage(), undefined);
});

test('首页可纠正无效分享码再导入，预览不写存储，保存去重并保留本机草稿', async () => {
  const ownDraft = { ...sample, title: '自己的菜单', dishIds: ['m2'] };
  setDraft(ownDraft);
  const order = mount('../pages/order/index');
  let navigation;
  let navigationFails = true;
  wx.navigateTo = async ({ url }) => {
    navigation = url;
    if (navigationFails) throw new Error('navigation failed');
  };
  const submit = (code) => order.importMenu({ detail: { value: { code } } });
  order.openMenuImporter();
  await submit(' ');
  assert.match(order.data.importError, /粘贴/);
  await submit('YZ_bad');
  assert.match(order.data.importError, /无效/);
  assert.equal(navigation, undefined);
  order.clearImportError();
  assert.equal(order.data.importError, '');
  const code = encodeMenuCode(sample);
  await submit(code);
  assert.equal(order.data.showingMenuImporter, true);
  assert.match(order.data.importError, /重试/);
  navigationFails = false;
  await submit(` ${code} \n`);
  assert.equal(order.data.showingMenuImporter, false);

  const url = new URL(navigation, 'https://example.invalid');
  assert.equal(url.pathname, '/pages/menu/index');
  const page = mount('../pages/menu/index');
  page.onLoad(Object.fromEntries(url.searchParams));
  assert.equal(page.data.mode, 'received');
  assert.equal(page.data.groups.length, 2);
  assert.deepEqual(readState().history, []);
  assert.deepEqual(readState().draft, ownDraft);
  page.openShareCode();
  assert.equal(page.data.shareCode, code);
  page.closeShareCode();
  page.openTitleEditor();
  assert.equal(page.data.editing, false);
  page.save();
  assert.equal(page.data.mode, 'saved');
  assert.equal(page.data.hasDraft, true);
  assert.deepEqual(readState().draft, ownDraft);
  assert.equal(saveReceived(sample).added, false);
  assert.equal(readState().history.length, 1);
  const invalid = mount('../pages/menu/index');
  invalid.onLoad({ code: 'YZ_bad' });
  assert.equal(invalid.data.mode, 'invalid');
  assert.equal(invalid.data.groups.length, 0);
});

test('首页就绪并授权后才检测分享码，取消后切回不重复提示', async () => {
  let needAuthorization = true;
  let clipboard = '普通文本';
  let privacyChecks = 0;
  let reads = 0;
  let prompts = 0;
  wx.getPrivacySetting = ({ success }) => {
    privacyChecks += 1;
    success({ needAuthorization });
  };
  wx.getClipboardData = async () => {
    reads += 1;
    return { data: clipboard };
  };
  wx.showModal = async () => { prompts += 1; return { confirm: false }; };
  wx.navigateTo = () => assert.fail('取消后不应打开菜单');

  await app.onShow();
  assert.equal(privacyChecks, 0);
  await app.onOrderReady();
  await app.onOrderReady();
  assert.equal(privacyChecks, 1);
  assert.equal(reads, 0);
  needAuthorization = false;
  app.onHide();
  await app.onShow();
  assert.equal(reads, 1);
  assert.equal(prompts, 0);
  clipboard = encodeMenuCode(sample);
  app.onHide();
  await app.onShow();
  assert.equal(prompts, 1);
  app.onHide();
  await app.onShow();
  assert.equal(prompts, 1);

  clipboard = encodeMenuCode({ ...sample, title: '新菜单' });
  app.onHide();
  await app.onShow();
  assert.equal(prompts, 2);
});

test('应用前台提示确认后打开收件预览，重入期间只检查一次，保留草稿与历史', async () => {
  const ownDraft = { ...sample, dishIds: ['m2'] };
  setDraft(ownDraft);
  const code = encodeMenuCode(sample);
  let finishPrompt;
  wx.getPrivacySetting = ({ success }) => { success({ needAuthorization: false }); };
  wx.getClipboardData = async () => ({ data: ` ${code}\n` });
  wx.showModal = ({ content }) => new Promise((resolve) => {
    assert.equal(content, getTitle(sample));
    assert.equal(finishPrompt, undefined);
    finishPrompt = resolve;
  });
  let url;
  wx.navigateTo = async (options) => { url = options.url; };

  await app.onShow();
  const check = app.onOrderReady();
  await new Promise(setImmediate);
  assert.equal(url, undefined);
  await app.onShow();
  finishPrompt({ confirm: true });
  await check;
  assert.equal(url, `/pages/menu/index?code=${code}`);
  assert.equal(app.handledClipboardCode, code);
  assert.deepEqual(readState().draft, ownDraft);
  assert.deepEqual(readState().history, []);
});

test('聊天卡片冷启动和后台唤起时跳过自动检测，普通进入后恢复检测', async () => {
  const card = { path: 'pages/menu/index', query: { code: encodeMenuCode(sample) } };
  const normal = { path: 'pages/order/index', query: {} };
  let privacyChecks = 0;
  let prompts = 0;
  wx.getPrivacySetting = ({ success }) => {
    privacyChecks += 1;
    success({ needAuthorization: false });
  };
  wx.showModal = async () => { prompts += 1; return { confirm: false }; };
  await app.onShow(card);
  await app.onOrderReady();
  assert.equal(privacyChecks, 0);

  let finishRead;
  wx.getClipboardData = () => new Promise((resolve) => { finishRead = resolve; });
  app.onHide();
  const check = app.onShow(normal);
  await new Promise(setImmediate);
  assert.equal(privacyChecks, 1);
  app.onHide();
  await app.onShow(card);
  finishRead({ data: card.query.code });
  await check;
  assert.equal(privacyChecks, 1);
  assert.equal(prompts, 0);

  wx.getClipboardData = async () => ({ data: card.query.code });
  app.onHide();
  await app.onShow(normal);
  assert.equal(privacyChecks, 2);
  assert.equal(prompts, 1);
});

test('主动读剪贴板失败时保留手动入口，随后可用同一入口查看有效分享码', async () => {
  const order = mount('../pages/order/index');
  let url;
  wx.navigateTo = async (options) => { url = options.url; };
  wx.getClipboardData = async () => { throw new Error('permission denied'); };
  order.openMenuImporter();
  await order.importClipboardMenu();
  assert.equal(url, undefined);
  assert.equal(order.data.showingMenuImporter, true);
  assert.match(order.data.importError, /手动粘贴/);

  const code = encodeMenuCode(sample);
  wx.getClipboardData = async () => ({ data: code });
  await order.importClipboardMenu();
  assert.equal(url, `/pages/menu/index?code=${code}`);
  assert.equal(order.data.showingMenuImporter, false);
  assert.equal(app.handledClipboardCode, code);
});

test('全部菜品、详情入口和图片都随包提供', () => {
  assert.equal(buildSettings.ignoreUploadUnusedFiles, false, '动态引用的做法图必须随包上传');
  assert.deepEqual(categories.map(({ id }) => dishes.filter((dish) => dish.category === id).length), [8, 8]);
  let recipeCount = 0;
  for (const dish of dishes) {
    const recipe = getRecipe(dish);
    assert.ok(recipe.images.length || recipe.steps.length, dish.name);
    recipeCount += recipe.images.length;
    for (const file of [dish.photo, dish.detailUrl.split('?')[0] + '.wxml']) {
      assert.ok(fs.existsSync(path.join(root, file)), file);
    }
    for (const image of recipe.images) {
      assert.equal(path.posix.dirname(image), `/${dish.category}/recipes`);
      assert.equal(path.extname(image), '.jpg');
      const jpeg = fs.readFileSync(path.join(root, image));
      assert.equal(jpeg.readUInt16BE(0), 0xffd8, image);
      assert.equal(jpeg.readUInt16BE(jpeg.length - 2), 0xffd9, image);
    }
  }
  assert.equal(recipeCount, 8);
});

test('标题栏避开微信胶囊，返回优先保留页面栈', () => {
  wx.getDeviceInfo = () => ({ platform: 'ios' });
  wx.getWindowInfo = () => ({ statusBarHeight: 54 });
  wx.getMenuButtonBoundingClientRect = () => ({ top: 61, bottom: 93, height: 32 });
  assert.deepEqual(getNavigationLayout(), { height: 100, center: 77, coverInset: 100 });
  const calls = [];
  wx.navigateBack = () => calls.push('back');
  wx.reLaunch = ({ url }) => calls.push(url);
  global.getCurrentPages = () => [{}, {}];
  try {
    goBack();
    global.getCurrentPages = () => [{}];
    goBack();
    assert.deepEqual(calls, ['back', '/pages/order/index']);
  } finally {
    delete global.getCurrentPages;
  }
});

test('详情按图号打开所属分包大图页，翻页换图且不能越过首尾', (t) => {
  let url;
  wx.navigateTo = (options) => { url = options.url; };
  const page = dishDetail('vegetables');
  page.setData = (next) => { Object.assign(page.data, next); };
  page.onLoad({ id: 'v4' });
  assert.deepEqual(page.data.images, [
    '/vegetables/recipes/tomato-eggs-1.jpg',
    '/vegetables/recipes/tomato-eggs-2.jpg',
  ]);
  page.openRecipePhoto(tap({ index: 1 }));
  assert.equal(url, '/vegetables/pages/recipe-photo/index?id=v4&index=1');
  const reader = mount('../vegetables/pages/recipe-photo/index');
  reader.onLoad({ id: 'v4', index: '1' });
  assert.equal(reader.data.total, 2);
  assert.match(reader.data.slides[0], /tomato-eggs-2/);
  reader.nextPhoto();
  assert.equal(reader.data.index, 1);
  reader.previousPhoto();
  assert.match(reader.data.slides[0], /tomato-eggs-1/);
  reader.previousPhoto();
  assert.equal(reader.data.index, 0);
  reader.nextPhoto();
  assert.match(reader.data.slides[0], /tomato-eggs-2/);
  const src = reader.data.slides[0];
  const error = { ...tap({ src }), detail: { errMsg: 'decode failed' } };
  const warn = t.mock.method(console, 'warn', () => {});
  page.handleRecipeImageError(error);
  reader.handleImageError(error);
  assert.deepEqual(warn.mock.calls.map(({ arguments: args }) => args), [
    ['做法缩略图加载失败', src, 'decode failed'],
    ['做法大图加载失败', src, 'decode failed'],
  ]);
  assert.equal(reader.data.imageError, true);
  reader.previousPhoto();
  assert.equal(reader.data.imageError, false);
});

test('单张做法图可打开，文字菜谱及跨分包图片路径不进入大图', () => {
  const reader = mount('../meat/pages/recipe-photo/index');
  reader.onLoad({ id: 'm1', index: '99' });
  assert.equal(reader.data.total, 1);
  assert.match(reader.data.slides[0], /cola-wings/);
  reader.startSwipe({ touches: [{ identifier: 1, clientX: 170, clientY: 50 }] });
  reader.endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 50, clientY: 50 }] });
  assert.equal(reader.data.index, 0);

  const otherReader = mount('../vegetables/pages/recipe-photo/index');
  otherReader.onLoad({ id: 'm1' });
  assert.equal(otherReader.data.total, 0);
  otherReader.onLoad({ id: 'v6' });
  assert.equal(otherReader.data.total, 0);
  otherReader.nextPhoto();
  assert.deepEqual(otherReader.data.slides, []);
});

test('多张做法图支持单指横滑，放大、双指、取消和纵滑均不翻页', () => {
  const reader = mount('../vegetables/pages/recipe-photo/index');
  reader.onLoad({ id: 'v4', index: '1' });
  const point = (clientX, clientY, identifier = 1) => ({ identifier, clientX, clientY });
  const start = () => reader.startSwipe({ touches: [point(150, 130)] });
  const end = (x, y) => reader.endSwipe({ touches: [], changedTouches: [point(x, y)] });
  const swipe = (x, y) => { start(); end(x, y); };
  const setScale = (scale) => reader.handlePhotoScale({
    ...tap({ src: reader.data.slides[0] }),
    detail: { scale },
  });

  swipe(40, 130);
  assert.equal(reader.data.index, 1);
  swipe(260, 138);
  assert.equal(reader.data.index, 0);
  swipe(260, 130);
  assert.equal(reader.data.index, 0);
  swipe(40, 270);
  swipe(102, 130);
  start();
  reader.cancelSwipe();
  end(40, 130);
  start();
  reader.moveSwipe({ touches: [point(150, 130), point(200, 130, 2)] });
  end(40, 130);
  setScale(2);
  swipe(40, 130);
  assert.equal(reader.data.index, 0);
  setScale(1);
  swipe(40, 138);
  assert.equal(reader.data.index, 1);
  setScale(3);
  reader.previousPhoto();
  swipe(40, 130);
  assert.equal(reader.data.index, 1);
});
