import { findRange, rangeProblem, type RangeLike } from './ranges.js';

const R: RangeLike[] = [
  { id: 'a', minPages: 10, maxPages: 12, on: true },
  { id: 'b', minPages: 14, maxPages: 16, on: true },
  { id: 'f', minPages: 40, maxPages: 40, on: true },
  { id: 'x', minPages: 50, maxPages: 60, on: false },
];

describe('spiral ranges', () => {
  it('finds the active range containing the page count', () => {
    expect(findRange(R, 10)?.id).toBe('a');
    expect(findRange(R, 12)?.id).toBe('a');
    expect(findRange(R, 40)?.id).toBe('f');
    for (const n of [9, 13, 17, 41, 55]) expect(findRange(R, n)).toBeNull();
  });
  it('validates numbers and order', () => {
    expect(rangeProblem({ minPages: 0, maxPages: 5 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 5.5, maxPages: 6 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 8, maxPages: 7 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 41, maxPages: 45 }, R)).toBeNull();
  });
  it('rejects overlap with another active range only', () => {
    expect(rangeProblem({ minPages: 12, maxPages: 13 }, R)).not.toBeNull();
    expect(rangeProblem({ minPages: 55, maxPages: 58 }, R)).toBeNull(); // overlaps an inactive one
    expect(rangeProblem({ id: 'a', minPages: 10, maxPages: 13 }, R)).toBeNull(); // itself is ignored
  });
});
