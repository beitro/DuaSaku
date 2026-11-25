/**
 * Safe recursive-descent arithmetic expression evaluator for IDR calculations.
 * Supports +, -, *, /, ×, ÷, decimals, unary +/-, and parentheses without eval().
 */

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

const MAX_EXPR_LENGTH = 512;
const MAX_PAREN_DEPTH = 64;

function tokenize(rawExpr: string): Token[] | null {
  if (typeof rawExpr !== 'string') return null;
  const expr = rawExpr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\u2212/g, '-')
    .trim();

  if (!expr || expr.length > MAX_EXPR_LENGTH) return null;

  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let dotCount = 0;

      while (i < expr.length) {
        const c = expr[i];
        if (c >= '0' && c <= '9') {
          numStr += c;
          i += 1;
        } else if (c === '.') {
          dotCount += 1;
          if (dotCount > 1) return null;
          numStr += c;
          i += 1;
        } else {
          break;
        }
      }

      if (numStr === '.' || numStr.length === 0) return null;
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) return null;
      tokens.push({ type: 'num', value: parsed });
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

/**
 * Evaluates a basic arithmetic expression safely using recursive descent.
 * Returns a rounded non-negative integer for IDR, or null on invalid syntax,
 * negative final results, or division by zero.
 */
export function evaluateExpression(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens) return null;

  let pos = 0;
  let depth = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token | undefined => {
    const tok = tokens[pos];
    pos += 1;
    return tok;
  };

  function parsePrimary(): number | null {
    const tok = peek();
    if (!tok) return null;

    if (tok.type === 'num') {
      consume();
      return tok.value;
    }

    if (tok.type === 'lparen') {
      if (depth >= MAX_PAREN_DEPTH) return null;
      consume();
      depth += 1;
      const inner = parseExpr();
      depth -= 1;
      if (inner === null) return null;
      if (peek()?.type !== 'rparen') return null;
      consume();
      return inner;
    }

    return null;
  }

  function parseUnary(): number | null {
    if (depth >= MAX_PAREN_DEPTH) return null;
    const tok = peek();
    if (tok?.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      depth += 1;
      const val = parseUnary();
      depth -= 1;
      if (val === null) return null;
      return tok.value === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) return null;

    while (true) {
      const tok = peek();
      if (tok?.type !== 'op' || (tok.value !== '*' && tok.value !== '/')) {
        break;
      }
      consume();
      const right = parseUnary();
      if (right === null) return null;

      if (tok.value === '/') {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }

      if (!Number.isFinite(left)) return null;
    }

    return left;
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (true) {
      const tok = peek();
      if (tok?.type !== 'op' || (tok.value !== '+' && tok.value !== '-')) {
        break;
      }
      consume();
      const right = parseTerm();
      if (right === null) return null;

      left = tok.value === '+' ? left + right : left - right;
      if (!Number.isFinite(left)) return null;
    }

    return left;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }

  const rounded = Math.round(result);
  if (!Number.isFinite(rounded) || rounded < 0) {
    return null;
  }

  return rounded === 0 ? 0 : rounded;
}
