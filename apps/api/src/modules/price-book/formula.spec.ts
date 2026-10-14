import { evalFormula, FormulaError, parseFormula, validateFormula } from './formula.js';

describe('formula', () => {
  it('evaluates the cardstock formula', () => {
    expect(evalFormula('2 * base_price - paper_cost', { base_price: 35000, paper_cost: 5000 })).toBe(65000);
  });
  it('respects precedence, parentheses and unary minus', () => {
    expect(evalFormula('2 + 3 * 4', {})).toBe(14);
    expect(evalFormula('(2 + 3) * 4', {})).toBe(20);
    expect(evalFormula('-2 * -3', {})).toBe(6);
  });
  it('supports min/max/round/floor/ceil and Persian digits and ×', () => {
    expect(evalFormula('max(base_price, 1000)', { base_price: 400 })).toBe(1000);
    expect(evalFormula('round(10 / 4)', {})).toBe(3);
    expect(evalFormula('۲ × ۳', {})).toBe(6);
  });
  it('throws on a missing variable and on division by zero', () => {
    expect(() => evalFormula('base_price * 2', {})).toThrow(FormulaError);
    expect(() => evalFormula('1 / (base_price - base_price)', { base_price: 3 })).toThrow(FormulaError);
  });
  it('rejects anything that is not arithmetic', () => {
    for (const bad of ['process.exit()', 'base_price; 1', 'constructor', 'a.b', '2 ** 3', '', '(1 + 2', 'min()', 'x'.repeat(201)]) {
      expect(validateFormula(bad)).not.toBeNull();
    }
  });
  it('rejects variables outside the allowed list', () => {
    expect(validateFormula('provider_price + 1', ['base_price'])).toMatch(/provider_price/);
    expect(validateFormula('base_price + 1', ['base_price'])).toBeNull();
  });
  it('limits nesting depth', () => {
    expect(() => parseFormula('('.repeat(60) + '1' + ')'.repeat(60))).toThrow(FormulaError);
  });
});
