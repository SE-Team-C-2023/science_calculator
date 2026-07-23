// Keep this in sync with sw.js's CACHE_NAME on every change — it's the
// easiest way to confirm which version is actually loaded on a phone.
const APP_VERSION = "v16";

const model = new CalculatorModel();

const padContainer = document.getElementById("pad-container");
const equationBox = document.getElementById("equation-box");
const previewLine = document.getElementById("preview-line");
const displayLine = document.getElementById("display-line");
const scientificToggleBtn = document.getElementById("scientific-toggle");
const deleteBtn = document.getElementById("delete-btn");
const historyToggleBtn = document.getElementById("history-toggle");
const historyBackdrop = document.getElementById("history-backdrop");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");
const appVersionEl = document.getElementById("app-version");

appVersionEl.textContent = "Calculator " + APP_VERSION;

let showHistory = false;
let showScientific = false;

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

function isPortrait() {
  return window.innerWidth <= window.innerHeight;
}

// Operators/parens/commas are legal line-break points; digits, letters,
// and decimal points never are, so a number or function name always moves
// to the next line as a whole instead of splitting across two.
const BREAK_CHARS = new Set(["+", "-", "×", "÷", "(", ")", ","]);

// Builds a fragment for `text` with an invisible <wbr> break opportunity
// around each operator/paren/comma — lets the line wrap between tokens
// without ever breaking inside a number, and without inserting any
// visible character (unlike a space, which we deliberately don't want
// around operators).
function fragmentWithBreaks(text) {
  const fragment = document.createDocumentFragment();
  let buffer = "";
  const flush = () => {
    if (buffer) {
      fragment.appendChild(document.createTextNode(buffer));
      buffer = "";
    }
  };
  for (const char of text) {
    if (BREAK_CHARS.has(char)) {
      flush();
      fragment.appendChild(document.createElement("wbr"));
      fragment.appendChild(document.createTextNode(char));
      fragment.appendChild(document.createElement("wbr"));
    } else {
      buffer += char;
    }
  }
  flush();
  return fragment;
}

// Right-aligned when it fits. Once it's too long, shrinks down to an 18px
// floor — and only past that point does it become horizontally scrollable
// (swipeable). Auto-scrolls to the end as you type, or keeps the edit
// cursor in view when one is active (see cursorFormattedPos). When wrap
// is true, skips all of the above and just lets the text wrap onto new
// lines instead (used for the equation, so it's never cut off), breaking
// only at the points fragmentWithBreaks allows.
function fitLine(el, text, baseFontSize, cursorFormattedPos, wrap) {
  const minFontSize = 18;
  let fontSize = baseFontSize;

  if (!wrap) {
    const containerWidth = el.clientWidth || el.parentElement.clientWidth;
    measureCtx.font = `500 ${baseFontSize}px "SF Mono", Menlo, Consolas, monospace`;
    const measured = measureCtx.measureText(text).width;
    if (measured > containerWidth) {
      const neededScale = containerWidth / measured;
      const scale = Math.max(neededScale, minFontSize / baseFontSize);
      fontSize = baseFontSize * scale;
    }
  }
  el.style.fontSize = fontSize + "px";

  if (cursorFormattedPos != null) {
    el.innerHTML = "";
    const pre = document.createElement("span");
    const post = document.createElement("span");
    const preText = text.slice(0, cursorFormattedPos);
    const postText = text.slice(cursorFormattedPos);
    if (wrap) {
      pre.appendChild(fragmentWithBreaks(preText));
      post.appendChild(fragmentWithBreaks(postText));
    } else {
      pre.textContent = preText;
      post.textContent = postText;
    }
    const cursor = document.createElement("span");
    cursor.className = "text-cursor";
    el.appendChild(pre);
    el.appendChild(cursor);
    el.appendChild(post);
  } else if (wrap) {
    el.innerHTML = "";
    el.appendChild(fragmentWithBreaks(text));
  } else {
    el.textContent = text;
  }

  requestAnimationFrame(() => {
    if (cursorFormattedPos != null) {
      const cursorEl = el.querySelector(".text-cursor");
      if (cursorEl) cursorEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (!wrap) {
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
  // Styling class is independent of the functional type: comma/parens are
  // colored like digits/operators rather than the scientific-function
  // color, matching the reference design.
  let styleClass = button.type;
  if (button.value === ",") styleClass = "digit";
  if (button.value === "(" || button.value === ")") styleClass = "operation";

  btn.className =
    "calc-btn " +
    styleClass +
    (button.value === "C" ? " clear" : "") +
    (button.value === "=" ? " equals" : "");
  btn.textContent = button.value;
  if (button.double) btn.classList.add("double");
  // pointerdown instead of click: fires immediately on touch (not on
  // release) and is dispatched independently per finger, so tapping two
  // buttons with two fingers at once registers both instead of the
  // browser's click synthesis dropping the second one.
  btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    model.tap(button);
  });
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
    res.textContent = "= " + entry.result;
    item.appendChild(eq);
    item.appendChild(res);
    item.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      model.recallHistory(entry);
    });
    historyList.appendChild(item);
  });
}

// If the equation has wrapped onto enough lines to grow tall enough to
// reach the result pinned at the bottom, shrink its font size (rather
// than let it overlap) until it fits the space actually available above
// the result, down to a minimum floor.
function shrinkEquationToFit(baseFontSize) {
  const minFontSize = 14;
  const container = previewLine.parentElement;
  const gap = 6; // matches the .display-lines CSS gap
  const availableHeight = container.clientHeight - displayLine.offsetHeight - gap;

  let fontSize = baseFontSize;
  let guard = 0;
  while (previewLine.scrollHeight > availableHeight && fontSize > minFontSize && guard < 100) {
    fontSize -= 1;
    previewLine.style.fontSize = fontSize + "px";
    guard++;
  }
}

function render() {
  const portrait = isPortrait();
  const expand = portrait && !showScientific;
  equationBox.classList.toggle("expand", expand);

  const equationSize = expand ? 44 : 24;
  const resultSize = expand ? 68 : 44;

  // Render the result first so we know how tall it is before deciding how
  // much room the (wrapping) equation above it has to work with.
  fitLine(displayLine, model.previewResult, resultSize, null, false);

  // previewLine (top) shows the equation — wraps instead of scrolling,
  // and is the one you can tap to place the edit cursor in.
  let cursorFormattedPos = null;
  if (model.cursorPosition !== null && !model.isError && model.equation) {
    const mapped = CalculatorEngine.formatDisplayValueMapped(model.equation);
    cursorFormattedPos = mapped.rawToFormatted[model.cursorPosition] ?? mapped.text.length;
  }
  fitLine(previewLine, model.displayText, equationSize, cursorFormattedPos, true);
  shrinkEquationToFit(equationSize);

  scientificToggleBtn.classList.toggle("active", showScientific);

  renderPad();
  renderHistory();
}

// Tap the equation to place the edit cursor there — digits/backspace then
// apply at that spot instead of always at the end.
previewLine.addEventListener("click", (event) => {
  if (model.isError || !model.equation) return;
  const formattedOffset = textOffsetFromPoint(previewLine, event.clientX, event.clientY);
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
