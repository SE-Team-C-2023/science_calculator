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

let showHistory = false;
let showScientific = false;

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

function isPortrait() {
  return window.innerWidth <= window.innerHeight;
}

// Right-aligned when it fits. Once it's too long, shrinks down to an 18px
// floor — and only past that point does it become horizontally scrollable
// (swipeable), auto-scrolling to the end as you type.
function fitLine(el, text, baseFontSize) {
  const minFontSize = 18;
  el.textContent = text;

  const containerWidth = el.clientWidth || el.parentElement.clientWidth;
  measureCtx.font = `500 ${baseFontSize}px "SF Mono", Menlo, Consolas, monospace`;
  const measured = measureCtx.measureText(text).width;

  let fontSize = baseFontSize;
  if (measured > containerWidth) {
    const neededScale = containerWidth / measured;
    const scale = Math.max(neededScale, minFontSize / baseFontSize);
    fontSize = baseFontSize * scale;
  }
  el.style.fontSize = fontSize + "px";
  requestAnimationFrame(() => {
    el.scrollLeft = el.scrollWidth;
  });
}

function createButtonEl(button) {
  const btn = document.createElement("button");
  btn.className = "calc-btn " + button.type + (button.double ? " double" : "");
  btn.textContent = button.value;
  btn.addEventListener("click", () => model.tap(button));
  return btn;
}

function buildGrid(rows, columns) {
  const grid = document.createElement("div");
  grid.className = "calc-grid";
  grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  rows.forEach((row) => row.forEach((button) => grid.appendChild(createButtonEl(button))));
  return grid;
}

function renderPad() {
  padContainer.innerHTML = "";
  const portrait = isPortrait();
  scientificToggleBtn.style.display = portrait ? "flex" : "none";

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
    item.addEventListener("click", () => model.recallHistory(entry));
    historyList.appendChild(item);
  });
}

function render() {
  const portrait = isPortrait();
  const expand = portrait && !showScientific;
  equationBox.classList.toggle("expand", expand);

  const previewSize = expand ? 22 : 16;
  const mainSize = expand ? 72 : 40;
  fitLine(previewLine, model.previewResult, previewSize);
  fitLine(displayLine, model.displayText, mainSize);

  scientificToggleBtn.classList.toggle("active", showScientific);

  renderPad();
  renderHistory();
}

scientificToggleBtn.addEventListener("click", () => {
  showScientific = !showScientific;
  render();
});

deleteBtn.addEventListener("click", () => model.deleteLastCharacter());

historyToggleBtn.addEventListener("click", () => {
  showHistory = !showHistory;
  historyBackdrop.classList.toggle("visible", showHistory);
  historyPanel.classList.toggle("visible", showHistory);
});

historyBackdrop.addEventListener("click", () => {
  showHistory = false;
  historyBackdrop.classList.remove("visible");
  historyPanel.classList.remove("visible");
});

clearHistoryBtn.addEventListener("click", () => model.clearHistory());

model.onChange(render);
window.addEventListener("resize", render);
window.addEventListener("orientationchange", render);

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
