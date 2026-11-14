const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, beforeEach } = require('node:test');
const { setting: buildSettings } = require('../project.config.json');
const { categories, dishes } = require('../data/dishes');
const { getRecipe } = require('../data/recipes');
const { getMealPeriod, getTitle, changeSelection, randomPair } = require('../lib/meal');
const { readSharedMenu, shareMenu } = require('../lib/share');
const { readState, saveDraft, saveReceived, setDraft } = require('../lib/store');
const { dishDetail } = require('../lib/dish-detail');
const { getNavigationLayout, goBack } = require('../lib/navigation');

const root = path.resolve(__dirname, '..');
const sample = { date: '2026-11-14', meal: 'dinner', title: '', dishIds: ['m1', 'v1'] };
const tap = (dataset = {}) => ({ currentTarget: { dataset } });

function mount(relativePath) {
  const file = require.resolve(relativePath);
  delete require.cache[file];
  let page;
  global.Page = (definition) => { page = definition; };
  try {
    require(file);
  } finally {
    delete global.Page;
  }
  page.setData = (next, done) => {
    Object.assign(page.data, next);
    if (done) done();
  };
  return page;
}

function shareQuery(menu) {
  return Object.fromEntries(new URL(shareMenu(menu).path, 'https://example.invalid').searchParams);
}

beforeEach(() => {
  const storage = new Map();
  global.wx = {
    getStorageSync: (key) => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {},
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

test('改名、保存后留在菜单页，历史可打开并重新分享', () => {
  setDraft(sample);
  const page = mount('../pages/menu/index');
  page.onLoad({});
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
  assert.equal(reopened.onShareAppMessage().title, '周末加餐');
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

test('分享卡片携带完整菜品及 Unicode 标题，并拒绝非法参数', () => {
  const menu = { ...sample, title: '我们吃饭 🍚 +&=？', dishIds: dishes.map(({ id }) => id) };
  const params = shareQuery(menu);
  assert.deepEqual(readSharedMenu(params), menu);
  assert.equal(shareMenu(menu).title, menu.title);
  assert.equal(readSharedMenu({ ...params, d: '2026-02-30' }), null);
  assert.equal(readSharedMenu({ ...params, i: 'm1.m1' }), null);
  assert.equal(readSharedMenu({ ...params, i: 'm9' }), null);
  assert.equal(readSharedMenu({ ...params, m: 'breakfast' }), null);
  assert.equal(readSharedMenu({ ...params, t: 'zzzz' }), null);
});

test('收件人可以查看并保存快照，同一卡片去重，本机草稿保留', () => {
  const ownDraft = { ...sample, title: '自己的菜单', dishIds: ['m2'] };
  setDraft(ownDraft);
  const page = mount('../pages/menu/index');
  page.onLoad(shareQuery(sample));
  assert.equal(page.data.mode, 'received');
  assert.equal(page.data.groups.length, 2);
  page.openTitleEditor();
  assert.equal(page.data.editing, false);
  page.save();
  assert.equal(page.data.mode, 'saved');
  assert.equal(page.data.hasDraft, true);
  assert.deepEqual(readState().draft, ownDraft);
  assert.equal(saveReceived(sample).added, false);
  assert.equal(readState().history.length, 1);
  const invalid = mount('../pages/menu/index');
  invalid.onLoad({ i: 'unknown' });
  assert.equal(invalid.data.mode, 'invalid');
  assert.equal(invalid.data.groups.length, 0);
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

test('标题栏避开微信胶囊，返回保留页面栈，分享直达时返回点菜首页', () => {
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

  const otherReader = mount('../vegetables/pages/recipe-photo/index');
  otherReader.onLoad({ id: 'm1' });
  assert.equal(otherReader.data.total, 0);
  otherReader.onLoad({ id: 'v6' });
  assert.equal(otherReader.data.total, 0);
  otherReader.nextPhoto();
  assert.deepEqual(otherReader.data.slides, []);
});
