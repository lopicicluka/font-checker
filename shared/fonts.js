/**
 * Shared font-family helpers for Font Checker.
 * Loaded in content scripts (and popup via script tag).
 */
(function (root) {
  const DEFAULT_STATE = {
    panelVisible: false,
    inspectEnabled: false,
    highlightEnabled: false,
    highlightMode: "match", // "match" | "not-match"
    targetFont: "",
  };

  function normalizeFontName(name) {
    if (!name) return "";
    return String(name)
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /** Split a CSS font-family value into individual family names. */
  function parseFontFamily(fontFamily) {
    if (!fontFamily) return [];
    const parts = [];
    let current = "";
    let quote = null;

    for (let i = 0; i < fontFamily.length; i++) {
      const ch = fontFamily[i];
      if (quote) {
        if (ch === quote) quote = null;
        else current += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ",") {
        const name = current.trim();
        if (name) parts.push(name);
        current = "";
        continue;
      }
      current += ch;
    }
    const last = current.trim();
    if (last) parts.push(last);
    return parts;
  }

  function primaryFont(fontFamily) {
    const parts = parseFontFamily(fontFamily);
    return parts[0] || "";
  }

  /** True if the computed stack includes the target family (case-insensitive). */
  function familyMatches(fontFamily, target) {
    const needle = normalizeFontName(target);
    if (!needle) return false;
    return parseFontFamily(fontFamily).some(
      (name) => normalizeFontName(name) === needle
    );
  }

  function collectFontsFromDocument(doc) {
    const seen = new Map();
    const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (!isSkippableElement(node)) {
        try {
          const ff = getComputedStyle(node).fontFamily;
          for (const name of parseFontFamily(ff)) {
            const key = normalizeFontName(name);
            if (key && !seen.has(key)) seen.set(key, name.replace(/^['"]+|['"]+$/g, ""));
          }
        } catch (_) {
          /* ignore cross-origin / disconnected */
        }
      }
      node = walker.nextNode();
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }

  function isSkippableElement(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "META" ||
      tag === "LINK" ||
      tag === "HEAD" ||
      tag === "BR" ||
      tag === "HR" ||
      tag === "IMG" ||
      tag === "SVG" ||
      tag === "PATH" ||
      tag === "CANVAS" ||
      tag === "VIDEO" ||
      tag === "AUDIO" ||
      tag === "IFRAME"
    ) {
      return true;
    }
    if (el.id === "fc-root" || (el.closest && el.closest("#fc-root"))) return true;
    if (el.classList && el.classList.contains("fc-ui")) return true;
    return false;
  }

  function hasDirectText(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) return true;
    }
    return false;
  }

  function readFontInfo(el) {
    const style = getComputedStyle(el);
    const stack = style.fontFamily;
    return {
      family: stack,
      primary: primaryFont(stack),
      size: style.fontSize,
      weight: style.fontWeight,
      style: style.fontStyle,
      lineHeight: style.lineHeight,
      color: style.color,
    };
  }

  root.FontCheckerShared = {
    DEFAULT_STATE,
    normalizeFontName,
    parseFontFamily,
    primaryFont,
    familyMatches,
    collectFontsFromDocument,
    isSkippableElement,
    hasDirectText,
    readFontInfo,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
