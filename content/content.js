(() => {
  const S = globalThis.FontCheckerShared;
  if (!S) return;

  const HIGHLIGHT_MATCH = "fc-highlight-match";
  const HIGHLIGHT_MISS = "fc-highlight-miss";
  const HOVER_OUTLINE = "fc-hover-outline";

  let state = { ...S.DEFAULT_STATE };
  let hoverEl = null;
  let pinnedInfo = null;
  let mutationTimer = null;
  let observer = null;

  const ui = {
    root: null,
    tooltip: null,
    pin: null,
    panel: null,
  };

  function ensureRoot() {
    if (ui.root && document.documentElement.contains(ui.root)) return ui.root;
    const root = document.createElement("div");
    root.id = "fc-root";
    root.className = "fc-ui";
    document.documentElement.appendChild(root);
    ui.root = root;
    return root;
  }

  function isOurUi(el) {
    return !!(el && (el.id === "fc-root" || el.closest?.("#fc-root")));
  }

  function deepestTextElement(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (isOurUi(el) || S.isSkippableElement(el)) continue;
      if (S.hasDirectText(el) || el.childElementCount === 0) return el;
    }
    return null;
  }

  function formatInfoRows(info, prefix = "fc-tooltip") {
    return [
      ["Size", info.size],
      ["Weight", info.weight],
      ["Style", info.style],
      ["Line", info.lineHeight],
      ["Color", info.color],
    ]
      .map(
        ([label, value]) =>
          `<div class="${prefix}__row"><span class="${prefix}__label">${label}</span><span class="${prefix}__value">${escapeHtml(
            value
          )}</span></div>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showTooltip(el, clientX, clientY) {
    const root = ensureRoot();
    if (!ui.tooltip) {
      ui.tooltip = document.createElement("div");
      ui.tooltip.className = "fc-tooltip fc-ui";
      root.appendChild(ui.tooltip);
    }
    const info = S.readFontInfo(el);
    ui.tooltip.innerHTML = `
      <div class="fc-tooltip__title">${escapeHtml(info.primary || "Unknown")}</div>
      ${formatInfoRows(info)}
      <div class="fc-stack">${escapeHtml(info.family)}</div>
    `;
    ui.tooltip.hidden = false;
    positionNear(ui.tooltip, clientX, clientY);
  }

  function hideTooltip() {
    if (ui.tooltip) ui.tooltip.hidden = true;
  }

  function positionNear(node, x, y) {
    const pad = 14;
    node.style.left = "0px";
    node.style.top = "0px";
    const rect = node.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
    node.style.left = `${Math.max(8, left)}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }

  function clearHoverOutline() {
    if (hoverEl) {
      hoverEl.classList.remove(HOVER_OUTLINE);
      hoverEl = null;
    }
  }

  function setHover(el) {
    if (hoverEl === el) return;
    clearHoverOutline();
    if (!el) return;
    hoverEl = el;
    hoverEl.classList.add(HOVER_OUTLINE);
  }

  function showPin(info, clientX, clientY) {
    const root = ensureRoot();
    if (!ui.pin) {
      ui.pin = document.createElement("div");
      ui.pin.className = "fc-pin fc-ui";
      root.appendChild(ui.pin);
    }
    pinnedInfo = info;
    ui.pin.innerHTML = `
      <div class="fc-pin__header">
        <div class="fc-pin__title">${escapeHtml(info.primary || "Unknown")}</div>
        <button type="button" class="fc-pin__close" title="Unpin" aria-label="Unpin">×</button>
      </div>
      ${formatInfoRows(info, "fc-pin")}
      <div class="fc-stack">${escapeHtml(info.family)}</div>
      <button type="button" class="fc-btn fc-btn--primary" data-fc-use-font>Use as target</button>
    `;
    ui.pin.hidden = false;
    positionNear(ui.pin, clientX ?? 24, clientY ?? 24);
    ui.pin.querySelector(".fc-pin__close").addEventListener("click", () => clearPin());
    ui.pin.querySelector("[data-fc-use-font]").addEventListener("click", () => {
      patchState({ targetFont: info.primary || "" });
    });
  }

  function clearPin() {
    pinnedInfo = null;
    if (ui.pin) ui.pin.hidden = true;
  }

  function onMouseMove(e) {
    if (!state.inspectEnabled) return;
    if (isOurUi(e.target)) {
      clearHoverOutline();
      hideTooltip();
      return;
    }
    const el = deepestTextElement(e.clientX, e.clientY);
    if (!el) {
      clearHoverOutline();
      hideTooltip();
      return;
    }
    setHover(el);
    showTooltip(el, e.clientX, e.clientY);
  }

  function onClick(e) {
    if (!state.inspectEnabled) return;
    if (isOurUi(e.target)) return;
    const el = deepestTextElement(e.clientX, e.clientY);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    showPin(S.readFontInfo(el), e.clientX, e.clientY);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && state.inspectEnabled) {
      patchState({ inspectEnabled: false });
    }
  }

  function setInspectEnabled(enabled) {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    clearHoverOutline();
    hideTooltip();
    if (enabled) {
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    }
  }

  function clearHighlights() {
    document
      .querySelectorAll(`.${HIGHLIGHT_MATCH}, .${HIGHLIGHT_MISS}`)
      .forEach((el) => {
        el.classList.remove(HIGHLIGHT_MATCH, HIGHLIGHT_MISS);
      });
  }

  function collectHighlightTargets() {
    const results = [];
    const root = document.body || document.documentElement;
    if (!root) return results;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (!S.isSkippableElement(node) && S.hasDirectText(node)) {
        results.push(node);
      }
      node = walker.nextNode();
    }
    return results;
  }

  function applyHighlights() {
    clearHighlights();
    if (!state.highlightEnabled || !state.targetFont) return;

    const mode = state.highlightMode === "not-match" ? "not-match" : "match";
    const cls = mode === "match" ? HIGHLIGHT_MATCH : HIGHLIGHT_MISS;

    for (const el of collectHighlightTargets()) {
      let family;
      try {
        family = getComputedStyle(el).fontFamily;
      } catch (_) {
        continue;
      }
      const matches = S.familyMatches(family, state.targetFont);
      const shouldHighlight = mode === "match" ? matches : !matches;
      if (shouldHighlight) el.classList.add(cls);
    }
  }

  function scheduleHighlight() {
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      if (state.highlightEnabled) applyHighlights();
    }, 150);
  }

  function setHighlightObserver(enabled) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (!enabled) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (isOurUi(m.target)) continue;
        scheduleHighlight();
        return;
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  /* ---------- Floating panel ---------- */

  function panelTemplate() {
    return `
      <div class="fc-panel__drag">
        <h2 class="fc-panel__title">Font Checker</h2>
        <button type="button" class="fc-panel__close" title="Hide panel" aria-label="Hide panel">×</button>
      </div>
      <div class="fc-panel__section">
        <span class="fc-panel__label">Inspect</span>
        <div class="fc-row">
          <span>Hover + click to pin</span>
          <label class="fc-toggle">
            <input type="checkbox" data-fc="inspectEnabled" />
            <span class="fc-toggle__slider"></span>
          </label>
        </div>
        <p class="fc-hint">Esc stops inspect. Click text to pin details.</p>
      </div>
      <div class="fc-panel__section">
        <span class="fc-panel__label">Target font</span>
        <select class="fc-select" data-fc="fontSelect"></select>
        <input class="fc-input" type="text" data-fc="targetFont" placeholder="Or type a font name" />
      </div>
      <div class="fc-panel__section">
        <span class="fc-panel__label">Highlight</span>
        <div class="fc-row">
          <span>Enable highlights</span>
          <label class="fc-toggle">
            <input type="checkbox" data-fc="highlightEnabled" />
            <span class="fc-toggle__slider"></span>
          </label>
        </div>
        <div class="fc-mode">
          <button type="button" data-fc-mode="match">Match</button>
          <button type="button" data-fc-mode="not-match">Not match</button>
        </div>
        <p class="fc-hint">Match = selected font. Not match = everything else.</p>
      </div>
      <div class="fc-panel__section">
        <button type="button" class="fc-btn" data-fc="refreshFonts">Refresh font list</button>
        <button type="button" class="fc-btn" data-fc="clearAll">Clear / reset</button>
      </div>
    `;
  }

  function ensurePanel() {
    const root = ensureRoot();
    if (ui.panel) return ui.panel;
    const panel = document.createElement("div");
    panel.className = "fc-panel fc-ui";
    panel.innerHTML = panelTemplate();
    root.appendChild(panel);
    ui.panel = panel;
    wirePanel(panel);
    return panel;
  }

  function fillFontSelect(select, fonts, current) {
    const prev = current || select.value;
    select.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— Select detected font —";
    select.appendChild(blank);
    for (const name of fonts) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
    if (prev) {
      const match = [...select.options].find(
        (o) => S.normalizeFontName(o.value) === S.normalizeFontName(prev)
      );
      select.value = match ? match.value : "";
    }
  }

  function syncPanelControls() {
    if (!ui.panel) return;
    const panel = ui.panel;
    panel.querySelector('[data-fc="inspectEnabled"]').checked = !!state.inspectEnabled;
    panel.querySelector('[data-fc="highlightEnabled"]').checked = !!state.highlightEnabled;
    panel.querySelector('[data-fc="targetFont"]').value = state.targetFont || "";
    panel.querySelectorAll("[data-fc-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.fcMode === state.highlightMode);
    });
    const select = panel.querySelector('[data-fc="fontSelect"]');
    fillFontSelect(select, S.collectFontsFromDocument(document), state.targetFont);
  }

  function wirePanel(panel) {
    panel.querySelector(".fc-panel__close").addEventListener("click", () => {
      patchState({ panelVisible: false });
    });

    panel.querySelector('[data-fc="inspectEnabled"]').addEventListener("change", (e) => {
      patchState({ inspectEnabled: e.target.checked });
    });

    panel.querySelector('[data-fc="highlightEnabled"]').addEventListener("change", (e) => {
      patchState({ highlightEnabled: e.target.checked });
    });

    panel.querySelector('[data-fc="targetFont"]').addEventListener("change", (e) => {
      patchState({ targetFont: e.target.value.trim() });
    });
    panel.querySelector('[data-fc="targetFont"]').addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        patchState({ targetFont: e.target.value.trim() });
      }
    });

    panel.querySelector('[data-fc="fontSelect"]').addEventListener("change", (e) => {
      if (e.target.value) patchState({ targetFont: e.target.value });
    });

    panel.querySelectorAll("[data-fc-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        patchState({ highlightMode: btn.dataset.fcMode });
      });
    });

    panel.querySelector('[data-fc="refreshFonts"]').addEventListener("click", () => {
      syncPanelControls();
    });

    panel.querySelector('[data-fc="clearAll"]').addEventListener("click", () => {
      clearPin();
      patchState({
        inspectEnabled: false,
        highlightEnabled: false,
        highlightMode: "match",
        targetFont: "",
      });
    });

    enableDrag(panel, panel.querySelector(".fc-panel__drag"));
  }

  function enableDrag(panel, handle) {
    let dragging = false;
    let ox = 0;
    let oy = 0;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".fc-panel__close")) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = `${Math.max(0, e.clientX - ox)}px`;
      panel.style.top = `${Math.max(0, e.clientY - oy)}px`;
      panel.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  function setPanelVisible(visible) {
    if (!visible) {
      if (ui.panel) ui.panel.hidden = true;
      return;
    }
    ensurePanel();
    ui.panel.hidden = false;
    syncPanelControls();
  }

  function applyState(next) {
    const prev = state;
    state = { ...S.DEFAULT_STATE, ...next };

    if (prev.inspectEnabled !== state.inspectEnabled) {
      setInspectEnabled(state.inspectEnabled);
    }

    if (
      prev.highlightEnabled !== state.highlightEnabled ||
      prev.highlightMode !== state.highlightMode ||
      prev.targetFont !== state.targetFont
    ) {
      if (state.highlightEnabled) {
        applyHighlights();
        setHighlightObserver(true);
      } else {
        clearHighlights();
        setHighlightObserver(false);
      }
    }

    if (prev.panelVisible !== state.panelVisible) {
      setPanelVisible(state.panelVisible);
    } else if (state.panelVisible) {
      syncPanelControls();
    }
  }

  function patchState(patch) {
    chrome.storage.local.set(patch);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...state };
    for (const [key, { newValue }] of Object.entries(changes)) {
      next[key] = newValue;
    }
    applyState(next);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FC_PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "FC_GET_PAGE_FONTS") {
      sendResponse({ fonts: S.collectFontsFromDocument(document) });
      return false;
    }
    return false;
  });

  chrome.storage.local.get(S.DEFAULT_STATE, (stored) => {
    applyState(stored);
  });
})();
