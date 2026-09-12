/**
 * Safely evaluate a mathematical expression with variable substitution.
 *
 * Only supports numbers, named variables, + - * / operators, parentheses,
 * and unary minus. There is NO access to JavaScript globals, object property
 * access, function calls, or any other executable code — the input is parsed
 * as a pure arithmetic AST and evaluated numerically.
 *
 * @param {string} expression - The math expression to evaluate.
 * @param {Object<string, number>} [scope] - Variable name → numeric value mapping.
 * @returns {number} The computed result.
 * @throws {Error} If the expression is invalid or contains unsupported syntax.
 */
export function safeEvalMath(expression, scope = {}) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new Error('Empty expression');
  }
  const tokens = tokenize(expression);
  const parser = new Parser(tokens, scope);
  const result = parser.parseExpression();
  parser.expectEnd();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Non-finite result');
  }
  return result;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

const TOKEN_TYPES = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  EOF: 'EOF',
};

function tokenize(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers: digits and decimal point (e.g. 42, 3.14, .5)
    if (/[0-9.]/.test(ch)) {
      let num = '';
      let dotCount = 0;
      while (i < len && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') {
          dotCount++;
          if (dotCount > 1) throw new Error('Invalid number format');
        }
        num += input[i];
        i++;
      }
      const val = parseFloat(num);
      if (isNaN(val)) throw new Error('Invalid number: ' + num);
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: val });
      continue;
    }

    // Identifiers: letter/underscore followed by letters/digits/underscores
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: TOKEN_TYPES.IDENT, value: ident });
      continue;
    }

    // Operators and parentheses
    switch (ch) {
      case '+': tokens.push({ type: TOKEN_TYPES.PLUS }); break;
      case '-': tokens.push({ type: TOKEN_TYPES.MINUS }); break;
      case '*': tokens.push({ type: TOKEN_TYPES.STAR }); break;
      case '/': tokens.push({ type: TOKEN_TYPES.SLASH }); break;
      case '(': tokens.push({ type: TOKEN_TYPES.LPAREN }); break;
      case ')': tokens.push({ type: TOKEN_TYPES.RPAREN }); break;
      default:
        throw new Error(`Unexpected character: '${ch}'`);
    }
    i++;
  }

  tokens.push({ type: TOKEN_TYPES.EOF });
  return tokens;
}

// ── Recursive-descent parser / evaluator ───────────────────────────────────

class Parser {
  constructor(tokens, scope) {
    this.tokens = tokens;
    this.pos = 0;
    this.scope = scope;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  expectEnd() {
    if (this.peek().type !== TOKEN_TYPES.EOF) {
      throw new Error('Unexpected trailing tokens');
    }
  }

  // expression := term (('+' | '-') term)*
  parseExpression() {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek().type;
      if (t === TOKEN_TYPES.PLUS) {
        this.next();
        left = left + this.parseTerm();
      } else if (t === TOKEN_TYPES.MINUS) {
        this.next();
        left = left - this.parseTerm();
      } else {
        break;
      }
    }
    return left;
  }

  // term := factor (('*' | '/') factor)*
  parseTerm() {
    let left = this.parseFactor();
    while (true) {
      const t = this.peek().type;
      if (t === TOKEN_TYPES.STAR) {
        this.next();
        left = left * this.parseFactor();
      } else if (t === TOKEN_TYPES.SLASH) {
        this.next();
        const right = this.parseFactor();
        if (right === 0) throw new Error('Division by zero');
        left = left / right;
      } else {
        break;
      }
    }
    return left;
  }

  // factor := ('-' | '+') factor | primary
  parseFactor() {
    const t = this.peek().type;
    if (t === TOKEN_TYPES.MINUS) {
      this.next();
      return -this.parseFactor();
    }
    if (t === TOKEN_TYPES.PLUS) {
      this.next();
      return this.parseFactor();
    }
    return this.parsePrimary();
  }

  // primary := number | identifier | '(' expression ')'
  parsePrimary() {
    const tok = this.peek();

    if (tok.type === TOKEN_TYPES.NUMBER) {
      this.next();
      return tok.value;
    }

    if (tok.type === TOKEN_TYPES.IDENT) {
      this.next();
      const name = tok.value;
      if (!(name in this.scope)) {
        throw new Error(`Unknown variable: '${name}'`);
      }
      const val = Number(this.scope[name]);
      if (isNaN(val)) throw new Error(`Non-numeric value for variable: '${name}'`);
      return val;
    }

    if (tok.type === TOKEN_TYPES.LPAREN) {
      this.next();
      const result = this.parseExpression();
      if (this.peek().type !== TOKEN_TYPES.RPAREN) {
        throw new Error('Expected closing parenthesis');
      }
      this.next();
      return result;
    }

    throw new Error('Unexpected end of expression');
  }
}