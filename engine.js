// Calculator math engine — a JS port of the Swift CalculatorEngine.
// Division by zero / domain errors (sqrt of negative, etc.) aren't manually
// guarded; JS floating point already produces Infinity/NaN for those, same
// as Swift's Double, and evaluate() catches that at one central point.

class ExpressionParser {
  constructor(expression, useDegrees) {
    this.chars = Array.from(expression);
    this.pos = 0;
    this.useDegrees = useDegrees;
  }

  peek() {
    return this.pos < this.chars.length ? this.chars[this.pos] : undefined;
  }

  skipWhitespace() {
    while (this.peek() === " ") this.pos++;
  }

  parse() {
    if (this.chars.length === 0) return null;
    const value = this.parseExpression();
    if (value === null) return null;
    this.skipWhitespace();
    if (this.pos !== this.chars.length) return null;
    return value;
  }

  parseExpression() {
    let value = this.parseTerm();
    if (value === null) return null;
    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "+" && op !== "-") break;
      this.pos++;
      const rhs = this.parseTerm();
      if (rhs === null) return null;
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  parseTerm() {
    let value = this.parsePower();
    if (value === null) return null;
    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "*" && op !== "/") break;
      this.pos++;
      const rhs = this.parsePower();
      if (rhs === null) return null;
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  parsePower() {
    const base = this.parseUnary();
    if (base === null) return null;
    this.skipWhitespace();
    if (this.peek() === "^") {
      this.pos++;
      const exponent = this.parsePower();
      if (exponent === null) return null;
      return Math.pow(base, exponent);
    }
    return base;
  }

  parseUnary() {
    this.skipWhitespace();
    if (this.peek() === "-") {
      this.pos++;
      const value = this.parseUnary();
      return value === null ? null : -value;
    }
    if (this.peek() === "+") {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    this.skipWhitespace();
    const char = this.peek();
    if (char === undefined) return null;

    if (char === "(") {
      this.pos++;
      const value = this.parseExpression();
      if (value === null) return null;
      this.skipWhitespace();
      if (this.peek() !== ")") return null;
      this.pos++;
      return value;
    }
    if (/[A-Za-z]/.test(char)) return this.parseFunctionCall();
    if (/[0-9.]/.test(char)) return this.parseNumber();
    return null;
  }

  parseFunctionCall() {
    const name = this.parseIdentifier();
    this.skipWhitespace();
    if (this.peek() !== "(") return null;
    this.pos++;

    const firstArg = this.parseExpression();
    if (firstArg === null) return null;
    const args = [firstArg];

    this.skipWhitespace();
    while (this.peek() === ",") {
      this.pos++;
      const nextArg = this.parseExpression();
      if (nextArg === null) return null;
      args.push(nextArg);
      this.skipWhitespace();
    }

    if (this.peek() !== ")") return null;
    this.pos++;

    const degToRad = Math.PI / 180;
    const radToDeg = 180 / Math.PI;

    switch (name) {
      case "sin":
        return Math.sin(this.useDegrees ? args[0] * degToRad : args[0]);
      case "cos":
        return Math.cos(this.useDegrees ? args[0] * degToRad : args[0]);
      case "tan":
        return Math.tan(this.useDegrees ? args[0] * degToRad : args[0]);
      case "asin": {
        const r = Math.asin(args[0]);
        return this.useDegrees ? r * radToDeg : r;
      }
      case "acos": {
        const r = Math.acos(args[0]);
        return this.useDegrees ? r * radToDeg : r;
      }
      case "atan": {
        const r = Math.atan(args[0]);
        return this.useDegrees ? r * radToDeg : r;
      }
      case "ln":
        return Math.log(args[0]);
      case "log10":
        return Math.log10(args[0]);
      case "sqrt":
        return Math.sqrt(args[0]);
      case "cbrt":
        return Math.cbrt(args[0]);
      case "exp":
        return Math.exp(args[0]);
      case "pow":
        return args.length === 2 ? Math.pow(args[0], args[1]) : null;
      case "fact": {
        const n0 = args[0];
        if (!(n0 >= 0) || n0 !== Math.round(n0) || n0 > 170) return NaN;
        const n = Math.round(n0);
        if (n <= 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      }
      default:
        return null;
    }
  }

  parseIdentifier() {
    // Letters and digits — "log10" wouldn't parse as one identifier
    // otherwise (it'd stop at "log" and fail to find "(" right after).
    let name = "";
    while (this.peek() !== undefined && /[A-Za-z0-9]/.test(this.peek())) {
      name += this.peek();
      this.pos++;
    }
    return name;
  }

  parseNumber() {
    let numberString = "";
    while (this.peek() !== undefined && /[0-9.]/.test(this.peek())) {
      numberString += this.peek();
      this.pos++;
    }
    return numberString.length ? parseFloat(numberString) : null;
  }
}

const CalculatorEngine = {
  isOperator(value) {
    return ["+", "-", "×", "÷", "^"].includes(value);
  },

  lastNumericToken(expression) {
    const separators = new Set(["+", "-", "×", "÷", "^", "%", "(", ")"]);
    let token = "";
    const chars = Array.from(expression).reverse();
    for (const char of chars) {
      if (separators.has(char)) break;
      token = char + token;
    }
    return token.length ? token : null;
  },

  // Grouping-formats every number in the expression (not just a trailing
  // one) and spaces out binary operators, so "1234+5" displays as
  // "1,234 + 5" instead of losing its thousands separator.
  formatDisplayValue(expression) {
    return this.formatDisplayValueMapped(expression).text;
  },

  // Same formatting as above, but also returns rawToFormatted: for each
  // index into the raw (unformatted) expression, the corresponding index
  // in the formatted text. Lets the UI translate a tapped screen position
  // back into a position in the real equation for cursor placement.
  //
  // Grouping commas/spacing are inserted characters with no raw
  // counterpart, so multiple formatted positions can collapse to one raw
  // position — that's fine, only the raw->formatted direction needs to be
  // exact. Scientific notation reshapes the digits entirely (rounding,
  // relocated decimal point), so precise per-digit mapping isn't possible
  // there; only the two edges of that number are mapped in that case.
  formatDisplayValueMapped(expression) {
    let result = "";
    let currentNumberRaw = "";
    let currentNumberStart = 0;
    const rawToFormatted = new Array(expression.length + 1).fill(0);

    const flushNumber = () => {
      if (!currentNumberRaw) return;
      const number = parseFloat(currentNumberRaw);
      const isValid = !Number.isNaN(number);
      const token = isValid ? this.formatNumber(number) : currentNumberRaw;

      if (isValid && !token.includes("e")) {
        let fi = 0;
        for (let ri = 0; ri < currentNumberRaw.length; ri++) {
          rawToFormatted[currentNumberStart + ri] = result.length + fi;
          while (token[fi] === ",") fi++;
          fi++;
        }
      } else {
        rawToFormatted[currentNumberStart] = result.length;
      }
      rawToFormatted[currentNumberStart + currentNumberRaw.length] = result.length + token.length;

      result += token;
      currentNumberRaw = "";
    };

    const spacedOperators = new Set(["+", "×", "÷"]);

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      if (/[0-9.]/.test(char)) {
        if (!currentNumberRaw) currentNumberStart = i;
        currentNumberRaw += char;
        continue;
      }
      flushNumber();
      rawToFormatted[i] = result.length;
      if (spacedOperators.has(char)) {
        result += ` ${char} `;
      } else if (char === "-") {
        const previous = result.length ? result[result.length - 1] : null;
        result += previous && (/[0-9]/.test(previous) || previous === ")") ? " - " : "-";
      } else {
        result += char;
      }
    }
    flushNumber();
    rawToFormatted[expression.length] = result.length;

    return { text: result, rawToFormatted };
  },

  // Switches to scientific notation for very large/small magnitudes,
  // matching the iPhone Calculator (e.g. "1.23456789e+15"). Display only —
  // never fed back into the parser, which doesn't understand "e" notation.
  formatNumber(value) {
    const magnitude = Math.abs(value);
    if (value !== 0 && (magnitude >= 1e12 || magnitude < 1e-6)) {
      return this.scientificNotation(value);
    }
    return this._groupedString(value);
  },

  _roundTo(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  },

  _groupedString(value) {
    const rounded = this._roundTo(value, 10);
    const parts = rounded.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  },

  // Plain (no grouping) string — used for anything written back into the
  // equation (after "=", MR, RND) so the parser never sees a comma.
  rawNumber(value) {
    return this._roundTo(value, 10).toString();
  },

  scientificNotation(value) {
    const formatted = value.toExponential(9);
    const [mantissaRaw, exponentRaw] = formatted.split("e");
    let mantissa = mantissaRaw;
    if (mantissa.includes(".")) {
      mantissa = mantissa.replace(/0+$/, "").replace(/\.$/, "");
    }
    const sign = exponentRaw[0] === "-" ? "-" : "+";
    let digits = exponentRaw.replace(/^[+-]/, "").replace(/^0+/, "");
    if (!digits) digits = "0";
    return `${mantissa}e${sign}${digits}`;
  },

  applyFunction(label, expression) {
    const wrapFns = {
      sin: "sin",
      cos: "cos",
      tan: "tan",
      ln: "ln",
      log: "log10",
      "√": "sqrt",
      "³√x": "cbrt",
      exp: "exp",
      "sin⁻¹": "asin",
      "cos⁻¹": "acos",
      "tan⁻¹": "atan",
    };
    if (label in wrapFns) {
      const wrapped = this.wrapLastNumericToken(expression, `${wrapFns[label]}(%@)`);
      return wrapped !== null ? wrapped : expression;
    }
    switch (label) {
      case "π":
        return expression + String(Math.PI);
      case "e":
        return expression + String(Math.E);
      case "1/x":
        return this._wrapOrNoop(expression, "(1/%@)");
      case "x²":
        return this._wrapOrNoop(expression, "pow(%@,2)");
      case "x³":
        return this._wrapOrNoop(expression, "pow(%@,3)");
      case "x^y":
        // Both parens inserted up front — the caller types the base, ",",
        // and exponent immediately before the trailing ")", so it never
        // needs to be typed manually.
        return this._wrapOrNoop(expression, "pow(%@,)");
      case "n!":
        return this._wrapOrNoop(expression, "fact(%@)");
      default:
        return expression;
    }
  },

  // All of the above require a number already typed; otherwise it's a no-op.
  _wrapOrNoop(expression, template) {
    const wrapped = this.wrapLastNumericToken(expression, template);
    return wrapped !== null ? wrapped : expression;
  },

  wrapLastNumericToken(expression, template) {
    const token = this.lastNumericToken(expression);
    if (token === null) return null;
    const prefix = expression.slice(0, expression.length - token.length);
    return prefix + template.replace("%@", token);
  },

  // Returns { type: 'value', value } | { type: 'error' } | { type: 'incomplete' }.
  // A nil parse means the syntax isn't complete yet (still typing). A
  // non-finite value (division by zero, sqrt(-1), etc.) means the syntax
  // was fine but the math wasn't — a real error.
  evaluate(expression, useDegrees) {
    const sanitized = this.sanitize(expression);
    if (!sanitized) return { type: "incomplete" };

    const parser = new ExpressionParser(sanitized, useDegrees);
    const value = parser.parse();
    if (value === null) return { type: "incomplete" };
    if (!Number.isFinite(value)) return { type: "error" };
    return { type: "value", value: this.rawNumber(value) };
  },

  sanitize(expression) {
    let string = expression
      .replaceAll("×", "*")
      .replaceAll("÷", "/")
      .replaceAll("%", "/100");

    const openCount = (string.match(/\(/g) || []).length;
    const closeCount = (string.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      string += ")".repeat(openCount - closeCount);
    }
    return string;
  },
};
