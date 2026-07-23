// App state — a JS port of the Swift CalculatorViewModel.

const HISTORY_STORAGE_KEY = "calculator-history";

class CalculatorModel {
  constructor() {
    this.equation = "";
    this.result = "0";
    this.isInverseMode = false;
    this.useDegrees = true;
    this.history = this._loadHistory();
    this.isError = false;
    this.memory = 0;

    // True right after "=" — the next digit typed starts a fresh equation
    // instead of appending to the previous result. Operators/functions
    // still chain from the result, matching standard calculator behavior.
    this.justEvaluated = false;

    // True while typing the arguments of an auto-closed call like x^y's
    // "pow(5,)" — new digits/commas get inserted before the trailing ")"
    // instead of after it, so the closing paren never needs typing.
    this.editingBeforeClosingParen = false;

    // Index into `equation` where the next digit/backspace applies. null
    // means "type/delete at the end" (the normal default). Set by tapping
    // the display; cleared by any non-digit action so it doesn't linger
    // into unrelated edits.
    this.cursorPosition = null;

    this._listeners = [];
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  _notify() {
    this._listeners.forEach((fn) => fn());
  }

  _loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      // Storage unavailable (private browsing, quota, etc.) — start empty.
      return [];
    }
  }

  _saveHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch {
      // Ignore — history just won't persist this session.
    }
  }

  get displayText() {
    if (this.isError) return "Error";
    if (!this.equation) return "0";
    return CalculatorEngine.formatDisplayValue(this.equation);
  }

  get previewResult() {
    if (this.isError) return "Error";
    if (!this.equation) return "0";
    const numeric = parseFloat(this.result);
    if (Number.isNaN(numeric)) return "=" + this.result;
    return "=" + CalculatorEngine.formatNumber(numeric);
  }

  get currentValue() {
    const token = CalculatorEngine.lastNumericToken(this.equation);
    return token !== null ? token : this.equation;
  }

  get portraitRows() {
    return [
      [cmd("C"), cmd("±"), cmd("%"), op("÷")],
      [dig("7"), dig("8"), dig("9"), op("×")],
      [dig("4"), dig("5"), dig("6"), op("-")],
      [dig("1"), dig("2"), dig("3"), op("+")],
      [dig("0", true), dig("."), op("=")],
    ];
  }

  get landscapeLeftRows() {
    return [
      [fn("2nd"), fn("("), fn(")"), fn("M+"), fn("M-")],
      [fn("MR"), fn("MC"), fn("π"), fn("e"), fn("n!")],
      [
        fn(this.isInverseMode ? "sin⁻¹" : "sin"),
        fn(this.isInverseMode ? "cos⁻¹" : "cos"),
        fn(this.isInverseMode ? "tan⁻¹" : "tan"),
        fn("ln"),
        fn("log"),
      ],
      [fn("x²"), fn("x³"), fn("√"), fn("³√x"), fn("x^y")],
      [fn("1/x"), fn("exp"), fn("RND"), fn(this.useDegrees ? "DEG" : "RAD"), fn(",")],
    ];
  }

  get landscapeRightRows() {
    return this.portraitRows;
  }

  tap(button) {
    switch (button.type) {
      case "digit":
        this.appendDigit(button.value);
        break;
      case "operation":
        this.handleOperation(button.value);
        break;
      case "function":
        this.handleFunction(button.value);
        break;
      case "command":
        this.handleCommand(button.value);
        break;
    }
    this._notify();
  }

  appendDigit(value) {
    if (this.justEvaluated) {
      this.equation = "";
      this.justEvaluated = false;
      this.isError = false;
      this.cursorPosition = null;
    }

    if (this.cursorPosition !== null) {
      const localToken = this._numericRunAt(this.cursorPosition);
      if (value === "." && localToken.includes(".")) return;
      this.equation =
        this.equation.slice(0, this.cursorPosition) + value + this.equation.slice(this.cursorPosition);
      this.cursorPosition += value.length;
      this._calculatePreview();
      return;
    }

    if (value === "." && this.currentValue.includes(".")) return;
    if (this.equation === "0" && value !== ".") {
      this.equation = value;
    } else {
      this._insert(value);
    }
    this._calculatePreview();
  }

  // The contiguous run of digits/dots touching `position`, used to check
  // for an existing "." when the cursor is positioned mid-equation rather
  // than always looking at the trailing token.
  _numericRunAt(position) {
    let start = position;
    while (start > 0 && /[0-9.]/.test(this.equation[start - 1])) start--;
    let end = position;
    while (end < this.equation.length && /[0-9.]/.test(this.equation[end])) end++;
    return this.equation.slice(start, end);
  }

  // Called when the user taps the display to position the edit cursor.
  setCursorPosition(rawIndex) {
    if (this.isError || !this.equation) return;
    this.cursorPosition = Math.max(0, Math.min(this.equation.length, rawIndex));
    this._notify();
  }

  // Inserts before a trailing auto-closed ")" while editing a function's
  // arguments (see editingBeforeClosingParen); otherwise appends normally.
  _insert(text) {
    if (this.editingBeforeClosingParen && this.equation.endsWith(")")) {
      this.equation = this.equation.slice(0, -1) + text + ")";
    } else {
      this.equation += text;
    }
  }

  handleOperation(symbol) {
    if (symbol === "=") {
      const outcome = CalculatorEngine.evaluate(this.equation, this.useDegrees);
      if (outcome.type === "value") {
        this.history.unshift({
          equation: this.equation,
          result: CalculatorEngine.formatNumber(parseFloat(outcome.value) || 0),
        });
        if (this.history.length > 50) this.history.pop();
        this._saveHistory();
        this.equation = outcome.value;
        this.result = outcome.value;
        this.isError = false;
        this.justEvaluated = true;
        this.editingBeforeClosingParen = false;
        this.cursorPosition = null;
      } else if (outcome.type === "error") {
        this.isError = true;
        this.justEvaluated = true;
        this.editingBeforeClosingParen = false;
        this.cursorPosition = null;
      }
      return;
    }

    this.justEvaluated = false;
    this.editingBeforeClosingParen = false;
    this.isError = false;
    this.cursorPosition = null;
    if (!this.equation) return;
    const last = this.equation.slice(-1);
    if (CalculatorEngine.isOperator(last)) {
      this.equation = this.equation.slice(0, -1);
    }
    this.equation += symbol;
    this._calculatePreview();
  }

  handleFunction(functionName) {
    this.justEvaluated = false;
    this.isError = false;
    this.cursorPosition = null;

    switch (functionName) {
      case "2nd":
        this.isInverseMode = !this.isInverseMode;
        this.editingBeforeClosingParen = false;
        break;
      case "DEG":
      case "RAD":
        this.useDegrees = !this.useDegrees;
        this.editingBeforeClosingParen = false;
        this._calculatePreview();
        break;
      case "MC":
        this.memory = 0;
        this.editingBeforeClosingParen = false;
        break;
      case "M+": {
        const v = parseFloat(this.result);
        if (!Number.isNaN(v)) this.memory += v;
        this.editingBeforeClosingParen = false;
        break;
      }
      case "M-": {
        const v = parseFloat(this.result);
        if (!Number.isNaN(v)) this.memory -= v;
        this.editingBeforeClosingParen = false;
        break;
      }
      case "MR":
        this.editingBeforeClosingParen = false;
        this._insertFreshNumber(CalculatorEngine.rawNumber(this.memory));
        break;
      case "RND":
        this.editingBeforeClosingParen = false;
        this._insertFreshNumber(CalculatorEngine.rawNumber(Math.random()));
        break;
      case "(":
        this.equation += "(";
        this.editingBeforeClosingParen = false;
        this._calculatePreview();
        break;
      case ")":
        this.equation += ")";
        this.editingBeforeClosingParen = false;
        this._calculatePreview();
        break;
      case ",":
        this._insert(",");
        this._calculatePreview();
        break;
      default: {
        const before = this.equation;
        this.equation = CalculatorEngine.applyFunction(functionName, this.equation);
        // Only enter paren-editing mode if x^y actually wrapped a number
        // (not a no-op), otherwise a later digit could land inside some
        // unrelated already-closed call ending in ")".
        this.editingBeforeClosingParen = functionName === "x^y" && this.equation !== before;
        this._calculatePreview();
      }
    }
  }

  _insertFreshNumber(value) {
    const last = this.equation.slice(-1);
    if (/[0-9.]/.test(last)) {
      const token = CalculatorEngine.lastNumericToken(this.equation);
      if (token !== null) {
        this.equation = this.equation.slice(0, this.equation.length - token.length) + value;
      } else {
        this.equation = value;
      }
    } else {
      this.equation += value;
    }
    this._calculatePreview();
  }

  handleCommand(command) {
    this.justEvaluated = false;
    this.editingBeforeClosingParen = false;
    this.isError = false;
    this.cursorPosition = null;
    switch (command) {
      case "C":
        this.equation = "";
        this.result = "0";
        break;
      case "±":
        this._toggleSign();
        break;
      case "%":
        this.equation += "%";
        break;
    }
    this._calculatePreview();
  }

  _toggleSign() {
    if (this.equation.startsWith("-")) {
      this.equation = this.equation.slice(1);
    } else {
      this.equation = "-" + this.equation;
    }
  }

  _calculatePreview() {
    const outcome = CalculatorEngine.evaluate(this.equation, this.useDegrees);
    if (outcome.type === "value") {
      this.result = outcome.value;
      this.isError = false;
    } else if (outcome.type === "error") {
      this.isError = true;
    }
  }

  recallHistory(entry) {
    this.equation = entry.equation;
    this.justEvaluated = false;
    this.isError = false;
    this.cursorPosition = null;
    this._calculatePreview();
    this._notify();
  }

  // Deletes before the cursor if one is active (from tapping the display),
  // otherwise deletes from the end — same as before.
  deleteLastCharacter() {
    if (!this.equation) return;
    this.justEvaluated = false;
    this.isError = false;

    if (this.cursorPosition !== null) {
      if (this.cursorPosition === 0) return;
      this.equation =
        this.equation.slice(0, this.cursorPosition - 1) + this.equation.slice(this.cursorPosition);
      this.cursorPosition -= 1;
    } else {
      this.equation = this.equation.slice(0, -1);
    }

    if (!this.equation) {
      this.result = "0";
      this.cursorPosition = null;
    } else {
      this._calculatePreview();
    }
    this._notify();
  }

  clearHistory() {
    this.history = [];
    this._saveHistory();
    this._notify();
  }
}

function dig(value, double) {
  return { type: "digit", value, double: !!double };
}
function op(value) {
  return { type: "operation", value };
}
function fn(value) {
  return { type: "function", value };
}
function cmd(value) {
  return { type: "command", value };
}
