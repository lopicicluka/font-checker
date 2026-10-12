const S = globalThis.FontCheckerShared;
const DEFAULT_STATE = S?.DEFAULT_STATE || {
  panelVisible: false,
  inspectEnabled: false,
  highlightEnabled: false,
  highlightMode: "match",
  targetFont: "",
};

const els = {
  panelVisible: document.getElementById("panelVisible"),
  inspectEnabled: document.getElementById("inspectEnabled"),
  highlightEnabled: document.getElementById("highlightEnabled"),
  targetFont: document.getElementById("targetFont"),
  fontSelect: document.getElementById("fontSelect"),
  refreshFonts: document.getElementById("refreshFonts"),
  clearAll: document.getElementById("clearAll"),
  modeMatch: document.getElementById("modeMatch"),
  modeNotMatch: document.getElementById("modeNotMatch"),
  status: document.getElementById("status"),
};

function setStatus(msg) {
  if (!msg) {
    els.status.hidden = true;
    els.status.textContent = "";
    return;
  }
  els.status.hidden = false;
  els.status.textContent = msg;
}

function patchState(patch) {
  return chrome.storage.local.set(patch);
}

function syncUi(state) {
  els.panelVisible.checked = !!state.panelVisible;
  els.inspectEnabled.checked = !!state.inspectEnabled;
  els.highlightEnabled.checked = !!state.highlightEnabled;
  els.targetFont.value = state.targetFont || "";
  els.modeMatch.classList.toggle("is-active", state.highlightMode === "match");
  els.modeNotMatch.classList.toggle("is-active", state.highlightMode === "not-match");

  if (state.targetFont) {
    const match = [...els.fontSelect.options].find(
      (o) =>
        (S?.normalizeFontName || ((x) => x.toLowerCase()))(o.value) ===
        (S?.normalizeFontName || ((x) => x.toLowerCase()))(state.targetFont)
    );
    els.fontSelect.value = match ? match.value : "";
  } else {
    els.fontSelect.value = "";
  }
}

function fillFontSelect(fonts, current) {
  const prev = current || els.fontSelect.value;
  els.fontSelect.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— Select detected font —";
  els.fontSelect.appendChild(blank);
  for (const name of fonts) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.fontSelect.appendChild(opt);
  }
  if (prev) {
    const match = [...els.fontSelect.options].find(
      (o) =>
        (S?.normalizeFontName || ((x) => x.toLowerCase()))(o.value) ===
        (S?.normalizeFontName || ((x) => x.toLowerCase()))(prev)
    );
    els.fontSelect.value = match ? match.value : "";
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshPageFonts() {
  setStatus("");
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab.");
    return;
  }
  if (!tab.url || /^(chrome|brave|edge|about|chrome-extension):/i.test(tab.url)) {
    setStatus("Open a normal web page to detect fonts.");
    fillFontSelect([], els.targetFont.value);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "FC_GET_PAGE_FONTS" });
    fillFontSelect(response?.fonts || [], els.targetFont.value);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["shared/fonts.js", "content/content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content/content.css"],
      });
      const response = await chrome.tabs.sendMessage(tab.id, { type: "FC_GET_PAGE_FONTS" });
      fillFontSelect(response?.fonts || [], els.targetFont.value);
    } catch (err) {
      setStatus("Could not reach this page. Try reloading the tab.");
      fillFontSelect([], els.targetFont.value);
    }
  }
}

function bind() {
  els.panelVisible.addEventListener("change", () => {
    patchState({ panelVisible: els.panelVisible.checked });
  });
  els.inspectEnabled.addEventListener("change", () => {
    patchState({ inspectEnabled: els.inspectEnabled.checked });
  });
  els.highlightEnabled.addEventListener("change", () => {
    patchState({ highlightEnabled: els.highlightEnabled.checked });
  });
  els.targetFont.addEventListener("change", () => {
    patchState({ targetFont: els.targetFont.value.trim() });
  });
  els.targetFont.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      patchState({ targetFont: els.targetFont.value.trim() });
    }
  });
  els.fontSelect.addEventListener("change", () => {
    if (els.fontSelect.value) {
      els.targetFont.value = els.fontSelect.value;
      patchState({ targetFont: els.fontSelect.value });
    }
  });
  els.modeMatch.addEventListener("click", () => patchState({ highlightMode: "match" }));
  els.modeNotMatch.addEventListener("click", () => patchState({ highlightMode: "not-match" }));
  els.refreshFonts.addEventListener("click", () => refreshPageFonts());
  els.clearAll.addEventListener("click", () => {
    patchState({
      inspectEnabled: false,
      highlightEnabled: false,
      highlightMode: "match",
      targetFont: "",
      panelVisible: false,
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(DEFAULT_STATE, syncUi);
});

bind();
chrome.storage.local.get(DEFAULT_STATE, (state) => {
  syncUi(state);
  refreshPageFonts();
});
