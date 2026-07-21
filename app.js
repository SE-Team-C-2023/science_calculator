const model = new CalculatorModel();

const padContainer = document.getElementById("pad-container");
const equationBox = document.getElementById("equation-box");
const previewLine = document.getElementById("preview-line");
const displayLine = document.getElementById("display-line");
const themeToggleBtn = document.getElementById("theme-toggle");
const scientificToggleBtn = document.getElementById("scientific-toggle");
const deleteBtn = document.getElementById("delete-btn");
const historyToggleBtn = document.getElementById("history-toggle");
const historyBackdrop = document.getElementById("history-backdrop");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");
const themeColorMeta = document.getElementById("theme-color-meta");

const THEME_STORAGE_KEY = "calculator-theme";

let showHistory = false;
let showScientific = false;

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  themeColorMeta.setAttribute("content", theme === "dark" ? "#000000" : "#e5e5ea");
}

themeToggleBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
});

applyTheme(currentTheme());

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

function isPortrait() {
  return window.innerWidth <= window.innerHeight;
}

// The result badge's CSS padding (1px 8px), accounted for in the fit
// calculation below so the highlighted text doesn't overflow its box.
const RESULT_HIGHLIGHT_PADDING = 16;

// Right-aligned when it fits. Once it's too long, shrinks down to an 18px
// floor — and only past that point does it become horizontally scrollable
// (swipeable). Auto-scrolls to the end as you type, or keeps the edit
// cursor in view when one is active (see cursorFormattedPos). When
// highlight is true, wraps the text in the yellow "result" badge.
function fitLine(el, text, baseFontSize, cursorFormattedPos, highlight) {
  const minFontSize = 18;

  const containerWidth = el.clientWidth || el.parentElement.clientWidth;
  measureCtx.font = `700 ${baseFontSize}px "SF Mono", Menlo, Consolas, monospace`;
  const measured = measureCtx.measureText(text).width + (highlight ? RESULT_HIGHLIGHT_PADDING : 0);

  let fontSize = baseFontSize;
  if (measured > containerWidth) {
    const neededScale = containerWidth / measured;
    const scale = Math.max(neededScale, minFontSize / baseFontSize);
    fontSize = baseFontSize * scale;
  }
  el.style.fontSize = fontSize + "px";

  if (highlight) {
    el.innerHTML = "";
    const badge = document.createElement("span");
    badge.className = "result-highlight";
    badge.textContent = text;
    el.appendChild(badge);
  } else if (cursorFormattedPos != null) {
    el.innerHTML = "";
    const pre = document.createElement("span");
    pre.textContent = text.slice(0, cursorFormattedPos);
    const cursor = document.createElement("span");
    cursor.className = "text-cursor";
    const post = document.createElement("span");
    post.textContent = text.slice(cursorFormattedPos);
    el.appendChild(pre);
    el.appendChild(cursor);
    el.appendChild(post);
  } else {
    el.textContent = text;
  }

  requestAnimationFrame(() => {
    if (cursorFormattedPos != null) {
      const cursorEl = el.querySelector(".text-cursor");
      if (cursorEl) cursorEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else {
      el.scrollLeft = el.scrollWidth;
    }
  });
}

// Converts a tap point into a character offset within el's text content,
// walking all of el's text nodes (there can be more than one once a cursor
// span has split the text into "before"/"after" pieces).
function textOffsetFromPoint(el, x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (!range || !el.contains(range.startContainer)) return null;

  let offset = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) return offset + range.startOffset;
    offset += node.textContent.length;
  }
  return offset;
}

// Finds the raw equation index whose mapped formatted position is closest
// to a tapped formatted-text offset.
function nearestRawPosition(rawToFormatted, formattedOffset) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < rawToFormatted.length; i++) {
    const dist = Math.abs(rawToFormatted[i] - formattedOffset);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function createButtonEl(button) {
  const btn = document.createElement("button");
  btn.className = "calc-btn " + button.type;
  btn.textContent = button.value;
  // pointerdown instead of click: fires immediately on touch (not on
  // release) and is dispatched independently per finger, so tapping two
  // buttons with two fingers at once registers both instead of the
  // browser's click synthesis dropping the second one.
  btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    model.tap(button);
  });

  // Digits get a padded blue frame behind them; other button types sit
  // directly in the grid.
  if (button.type === "digit") {
    const wrap = document.createElement("div");
    wrap.className = "digit-wrap" + (button.double ? " double" : "");
    wrap.appendChild(btn);
    return wrap;
  }

  if (button.double) btn.classList.add("double");
  return btn;
}

function buildGrid(rows, columns) {
  const grid = document.createElement("div");
  grid.className = "calc-grid";
  grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  rows.forEach((row) => row.forEach((button) => grid.appendChild(createButtonEl(button))));
  return grid;
}

let lastLayoutMode = null;

function renderPad() {
  const portrait = isPortrait();
  scientificToggleBtn.style.display = portrait ? "flex" : "none";
  const layoutMode = !portrait ? "landscape" : showScientific ? "portrait-scientific" : "portrait-basic";

  // Only animate the swap when the layout actually changes (e.g. toggling
  // the scientific panel), not on every keystroke re-render.
  const layoutChanged = layoutMode !== lastLayoutMode;
  lastLayoutMode = layoutMode;

  padContainer.innerHTML = "";
  if (!portrait) {
    padContainer.classList.remove("stacked");
    padContainer.appendChild(buildGrid(model.landscapeLeftRows, 5));
    padContainer.appendChild(buildGrid(model.landscapeRightRows, 4));
  } else if (showScientific) {
    padContainer.classList.add("stacked");
    padContainer.appendChild(buildGrid(model.landscapeLeftRows, 5));
    padContainer.appendChild(buildGrid(model.portraitRows, 4));
  } else {
    padContainer.classList.remove("stacked");
    padContainer.appendChild(buildGrid(model.portraitRows, 4));
  }

  if (layoutChanged) {
    padContainer.style.opacity = "0";
    padContainer.style.transform = "scale(0.98)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        padContainer.style.opacity = "1";
        padContainer.style.transform = "scale(1)";
      });
    });
  }
}

function renderHistory() {
  historyList.innerHTML = "";
  if (model.history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No history yet";
    historyList.appendChild(empty);
    return;
  }
  model.history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const eq = document.createElement("div");
    eq.className = "eq";
    eq.textContent = entry.equation;
    const res = document.createElement("div");
    res.className = "res";
    const resBadge = document.createElement("span");
    resBadge.className = "result-highlight";
    resBadge.textContent = "= " + entry.result;
    res.appendChild(resBadge);
    item.appendChild(eq);
    item.appendChild(res);
    item.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      model.recallHistory(entry);
    });
    historyList.appendChild(item);
  });
}

function render() {
  const portrait = isPortrait();
  const expand = portrait && !showScientific;
  equationBox.classList.toggle("expand", expand);

  const previewSize = expand ? 22 : 16;
  const mainSize = expand ? 72 : 40;
  fitLine(previewLine, model.previewResult, previewSize, null, true);

  let cursorFormattedPos = null;
  if (model.cursorPosition !== null && !model.isError && model.equation) {
    const mapped = CalculatorEngine.formatDisplayValueMapped(model.equation);
    cursorFormattedPos = mapped.rawToFormatted[model.cursorPosition] ?? mapped.text.length;
  }
  fitLine(displayLine, model.displayText, mainSize, cursorFormattedPos);

  scientificToggleBtn.classList.toggle("active", showScientific);

  renderPad();
  renderHistory();
}

// Tap the equation to place the edit cursor there — digits/backspace then
// apply at that spot instead of always at the end.
displayLine.addEventListener("click", (event) => {
  if (model.isError || !model.equation) return;
  const formattedOffset = textOffsetFromPoint(displayLine, event.clientX, event.clientY);
  if (formattedOffset == null) return;
  const { rawToFormatted } = CalculatorEngine.formatDisplayValueMapped(model.equation);
  model.setCursorPosition(nearestRawPosition(rawToFormatted, formattedOffset));
});

scientificToggleBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  showScientific = !showScientific;
  render();
});

deleteBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  model.deleteLastCharacter();
});

historyToggleBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  showHistory = !showHistory;
  historyBackdrop.classList.toggle("visible", showHistory);
  historyPanel.classList.toggle("visible", showHistory);
});

historyBackdrop.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  showHistory = false;
  historyBackdrop.classList.remove("visible");
  historyPanel.classList.remove("visible");
});

clearHistoryBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  model.clearHistory();
});

model.onChange(render);
window.addEventListener("resize", render);
window.addEventListener("orientationchange", render);

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
