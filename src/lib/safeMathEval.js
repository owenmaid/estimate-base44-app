/**
 * Safe arithmetic evaluator for admin-authored formula strings.
 *
 * Security model:
 *  - Closed grammar: only numbers, identifiers, + - * / and parentheses.
 *    Any other character throws during tokenization.
 *  - No dynamic execution: no eval, no Function, no property access,
 *    no call syntax. A hostile string cannot become JavaScript.
 *  - Values are computed inline during the recursive descent; no AST is
 *    retained. (Previous comment claimed an AST — it does not build one.)
 *  - Fails closed: every error path throws. Callers must catch.
 *
 * Availability guards:
 *  - MAX_EXPRESSION_LENGTH caps tokenizer work.
 *  - MAX_DEPTH caps recursion so deeply nested or long unary chains
 *    raise a catchable Error instead of a RangeError.
 */

const MAX_EXPRESSION_LENGTH = 1000;
const MAX_DEPTH = 64;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const TOKEN = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
};

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let start = i;
      let seenDot = false;
      while (i < input.length) {
        const c = input[i];
        if (c >= '0' && c <= '9') {
          i++;
        } else if (c === '.' && !seenDot) {
          seenDot = true;
          i++;
        } else {
          break;
        }
      }
      const raw = input.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: '${raw}'`);
      }
      tokens.push({ type: TOKEN.NUMBER, value });
      continue;
    }

    // Leading-dot numbers: .5
    if (ch === '.') {
      let start = i;
      i++;
      if (!(input[i] >= '0' && input[i] <= '9')) {
        throw new Error("Invalid character: '.'");
      }
      while (i < input.length && input[i] >= '0' && input[i] <= '9') i++;
      tokens.push({ type: TOKEN.NUMBER, value: Number(input.slice(start, i)) });
      continue;
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let start = i;
      while (i < input.length) {
        const c = input[i];
        const isWord =
          (c >= 'a' && c <= 'z') ||
          (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') ||
          c === '_';
        if (!isWord) break;
        i++;
      }
      tokens.push({ type: TOKEN.IDENT, value: input.slice(start, i) });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: TOKEN.OP, value: ch });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: TOKEN.LPAREN, value: ch });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: TOKEN.RPAREN, value: ch });
      i++;
      continue;
    }

    throw new Error(`Invalid character: '${ch}'`);
  }

  return tokens;
}

class Parser {
  constructor(tokens, scope) {
    this.tokens = tokens;
    this.scope = scope;
    this.pos = 0;
    this.depth = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  enter() {
    if (++this.depth > MAX_DEPTH) {
      throw new Error('Expression too deeply nested');
    }
  }

  exit() {
    this.depth--;
  }

  // expression := term (('+' | '-') term)*
  parseExpression() {
    let left = this.parseTerm();
    while (true) {
      const tok = this.peek();
      if (!tok || tok.type !== TOKEN.OP) break;
      if (tok.value !== '+' && tok.value !== '-') break;
      this.next();
      const right = this.parseTerm();
      left = tok.value === '+' ? left + right : left - right;
    }
    return left;
  }

  // term := factor (('*' | '/') factor)*
  parseTerm() {
    let left = this.parseFactor();
    while (true) {
      const tok = this.peek();
      if (!tok || tok.type !== TOKEN.OP) break;
      if (tok.value !== '*' && tok.value !== '/') break;
      this.next();
      const right = this.parseFactor();
      if (tok.value === '*') {
        left = left * right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        left = left / right;
      }
    }
    return left;
  }

  // factor := ('+' | '-') factor | primary
  parseFactor() {
    this.enter();
    try {
      const tok = this.peek();
      if (tok && tok.type === TOKEN.OP && (tok.value === '+' || tok.value === '-')) {
        this.next();
        const value = this.parseFactor();
        return tok.value === '-' ? -value : value;
      }
      return this.parsePrimary();
    } finally {
      this.exit();
    }
  }

  // primary := NUMBER | IDENT | '(' expression ')'
  parsePrimary() {
    this.enter();
    try {
      const tok = this.next();

      if (!tok) {
        throw new Error('Unexpected end of expression');
      }

      if (tok.type === TOKEN.NUMBER) {
        return tok.value;
      }

      if (tok.type === TOKEN.IDENT) {
        if (!hasOwn(this.scope, tok.value)) {
          throw new Error(`Unknown variable: '${tok.value}'`);
        }
        const raw = this.scope[tok.value];
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          throw new Error(`Non-numeric value for variable: '${tok.value}'`);
        }
        return value;
      }

      if (tok.type === TOKEN.LPAREN) {
        const value = this.parseExpression();
        const closing = this.next();
        if (!closing || closing.type !== TOKEN.RPAREN) {
          throw new Error('Missing closing parenthesis');
        }
        return value;
      }

      throw new Error(`Unexpected token: '${tok.value}'`);
    } finally {
      this.exit();
    }
  }
}

/**
 * Evaluate an arithmetic expression against a variable scope.
 *
 * @param {string} expression  Formula string, e.g. "(base + extra) * rate"
 * @param {object} variables   Flat map of variable name to numeric value.
 * @returns {number}           Finite number.
 * @throws {Error}             On any invalid input. Never returns NaN.
 */
export function safeEvalMath(expression, variables = {}) {
  if (typeof expression !== 'string') {
    throw new Error('Expression must be a string');
  }

  const trimmed = expression.trim();

  if (trimmed.length === 0) {
    throw new Error('Expression is empty');
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    throw new Error('Expression too long');
  }

  // Prototype-free scope: nothing to walk even if a lookup slipped through.
  const scope = Object.create(null);
  if (variables && typeof variables === 'object') {
    for (const key of Object.keys(variables)) {
      scope[key] = variables[key];
    }
  }

  const tokens = tokenize(trimmed);

  if (tokens.length === 0) {
    throw new Error('Expression is empty');
  }

  const parser = new Parser(tokens, scope);
  const result = parser.parseExpression();

  if (parser.pos !== tokens.length) {
    const leftover = tokens[parser.pos];
    throw new Error(`Unexpected token: '${leftover.value}'`);
  }

  if (!Number.isFinite(result)) {
    throw new Error('Expression did not produce a finite number');
  }

  return result;
}

export default safeEvalMath;
