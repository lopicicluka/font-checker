const DEFAULT_STATE = {
  panelVisible: false,
  inspectEnabled: false,
  highlightEnabled: false,
  highlightMode: "match",
  targetFont: "",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (stored) => {
    chrome.storage.local.set({ ...DEFAULT_STATE, ...stored });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FC_GET_STATE") {
    chrome.storage.local.get(DEFAULT_STATE, (state) => {
      sendResponse({ state });
    });
    return true;
  }

  if (message?.type === "FC_SET_STATE") {
    chrome.storage.local.set(message.patch || {}, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
