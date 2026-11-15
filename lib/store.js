const { menuFingerprint } = require('./meal');

const STORAGE_KEY = 'family-meals';

function readState() {
  return wx.getStorageSync(STORAGE_KEY) || { draft: null, history: [], nextId: 1 };
}

function setDraft(draft) {
  wx.setStorageSync(STORAGE_KEY, { ...readState(), draft });
}

function appendHistory(state, menu, draft) {
  const entry = { ...menu, id: String(state.nextId), savedAt: Date.now() };
  wx.setStorageSync(STORAGE_KEY, {
    draft,
    history: [entry, ...state.history],
    nextId: state.nextId + 1,
  });
  return entry;
}

function saveDraft() {
  const state = readState();
  return state.draft ? appendHistory(state, state.draft, null) : null;
}

function saveReceived(menu) {
  const state = readState();
  const fingerprint = menuFingerprint(menu);
  const existing = state.history.find((entry) => menuFingerprint(entry) === fingerprint);
  if (existing) return { entry: existing, added: false };
  return { entry: appendHistory(state, menu, state.draft), added: true };
}

module.exports = { readState, setDraft, saveDraft, saveReceived };
