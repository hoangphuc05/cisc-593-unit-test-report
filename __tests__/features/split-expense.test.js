import { describe, it, expect, vi } from 'vitest';
import {
  validateSplitInput,
  calculateSplits,
} from '../../features/split-expense.js';
import splitExpenseEndpoint from '../../features/split-expense.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createReq(body = {}) {
  return { body };
}

function createRes({ isAuthenticated = true, user = { id: 1 } } = {}) {
  const res = { locals: { isAuthenticated, user }, statusCode: 200, _body: null };
  res.status = vi.fn().mockImplementation((code) => { res.statusCode = code; return res; });
  res.json  = vi.fn().mockImplementation((body) => { res._body = body; return res; });
  res.send  = vi.fn().mockImplementation((body) => { res._body = body; return res; });
  return res;
}

// Minimal valid payloads — total is now part of every request body
const membersTwo   = [{ id: 1 }, { id: 2 }];
const membersThree = [{ id: 1 }, { id: 2 }, { id: 3 }];

const validEqual = { group: 1, total: 90, method: 'equal', members: membersTwo };

const validPercent = {
  group: 1,
  total: 100,
  method: 'percent',
  members: [{ id: 1, weight: 50 }, { id: 2, weight: 30 }, { id: 3, weight: 20 }],
};

const validShares = {
  group: 1,
  total: 100,
  method: 'shares',
  members: [{ id: 1, weight: 1 }, { id: 2, weight: 1 }, { id: 3, weight: 2 }],
};

// ---------------------------------------------------------------------------
// validateSplitInput
// ---------------------------------------------------------------------------

describe('validateSplitInput', () => {
  it('returns true for a valid equal split', () => {
    expect(validateSplitInput(validEqual)).toBe(true);
  });

  it('returns true for a valid percent split (weights sum to 100)', () => {
    expect(validateSplitInput(validPercent)).toBe(true);
  });

  it('returns true for a valid shares split', () => {
    expect(validateSplitInput(validShares)).toBe(true);
  });

  it('returns false when group is missing', () => {
    const { group, ...rest } = validEqual;
    expect(validateSplitInput(rest)).toBe(false);
  });

  it('returns false when group is not a positive integer', () => {
    expect(validateSplitInput({ ...validEqual, group: 0 })).toBe(false);
  });

  it('returns false when total is missing', () => {
    const { total, ...rest } = validEqual;
    expect(validateSplitInput(rest)).toBe(false);
  });

  it('returns false when total is zero', () => {
    expect(validateSplitInput({ ...validEqual, total: 0 })).toBe(false);
  });

  it('returns false when total is negative', () => {
    expect(validateSplitInput({ ...validEqual, total: -50 })).toBe(false);
  });

  it('returns false when method is missing', () => {
    const { method, ...rest } = validEqual;
    expect(validateSplitInput(rest)).toBe(false);
  });

  it('returns false when method is an unknown value', () => {
    expect(validateSplitInput({ ...validEqual, method: 'random' })).toBe(false);
  });

  it('returns false when members array is empty', () => {
    expect(validateSplitInput({ ...validEqual, members: [] })).toBe(false);
  });

  it('returns false when members is missing', () => {
    const { members, ...rest } = validEqual;
    expect(validateSplitInput(rest)).toBe(false);
  });

  it('returns false for percent method when weights do not sum to 100', () => {
    const bad = {
      ...validPercent,
      members: [{ id: 1, weight: 50 }, { id: 2, weight: 40 }], // sums to 90
    };
    expect(validateSplitInput(bad)).toBe(false);
  });

  it('returns false for percent method when a member is missing a weight', () => {
    const bad = {
      ...validPercent,
      members: [{ id: 1, weight: 60 }, { id: 2 }],
    };
    expect(validateSplitInput(bad)).toBe(false);
  });

  it('returns false for shares method when a weight is zero', () => {
    const bad = {
      ...validShares,
      members: [{ id: 1, weight: 0 }, { id: 2, weight: 2 }],
    };
    expect(validateSplitInput(bad)).toBe(false);
  });

  it('returns false for shares method when a weight is not an integer', () => {
    const bad = {
      ...validShares,
      members: [{ id: 1, weight: 1.5 }, { id: 2, weight: 2 }],
    };
    expect(validateSplitInput(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateSplits
// ---------------------------------------------------------------------------

describe('calculateSplits', () => {
  // --- equal ---
  it('equal: splits $100 evenly among 3 members, remainder to first', () => {
    const result = calculateSplits(100, 'equal', membersThree);
    // floor(33.333…) = 33.33 each → distributed = 99.99 → remainder 0.01 → first gets 33.34
    expect(result[0].portion).toBe(33.34);
    expect(result[1].portion).toBe(33.33);
    expect(result[2].portion).toBe(33.33);
  });

  it('equal: sum of portions equals the total amount', () => {
    const result = calculateSplits(100, 'equal', membersThree);
    const sum = result.reduce((s, r) => s + r.portion, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('equal: splits a cleanly divisible amount with no remainder', () => {
    const result = calculateSplits(90, 'equal', membersTwo);
    expect(result[0].portion).toBe(45);
    expect(result[1].portion).toBe(45);
  });

  it('equal: maps results to correct member ids', () => {
    const members = [{ id: 5 }, { id: 9 }];
    const result = calculateSplits(10, 'equal', members);
    expect(result[0].memberId).toBe(5);
    expect(result[1].memberId).toBe(9);
  });

  // --- percent ---
  it('percent: 50/30/20 split of $200', () => {
    const members = [
      { id: 1, weight: 50 },
      { id: 2, weight: 30 },
      { id: 3, weight: 20 },
    ];
    const result = calculateSplits(200, 'percent', members);
    expect(result[0].portion).toBe(100);
    expect(result[1].portion).toBe(60);
    expect(result[2].portion).toBe(40);
  });

  it('percent: sum of portions equals total amount', () => {
    const members = [
      { id: 1, weight: 33 },
      { id: 2, weight: 33 },
      { id: 3, weight: 34 },
    ];
    const result = calculateSplits(99.99, 'percent', members);
    const sum = result.reduce((s, r) => Math.round((s + r.portion) * 100) / 100, 0);
    expect(sum).toBe(99.99);
  });

  it('percent: remainder goes to first member', () => {
    const members = [
      { id: 1, weight: 33.33 },
      { id: 2, weight: 33.33 },
      { id: 3, weight: 33.34 },
    ];
    const result = calculateSplits(100, 'percent', members);
    const sum = result.reduce((s, r) => Math.round((s + r.portion) * 100) / 100, 0);
    expect(sum).toBe(100);
  });

  // --- shares ---
  it('shares: 1/1/2 among 3 members of $100 → 25/25/50', () => {
    const result = calculateSplits(100, 'shares', validShares.members);
    expect(result[0].portion).toBe(25);
    expect(result[1].portion).toBe(25);
    expect(result[2].portion).toBe(50);
  });

  it('shares: sum of portions equals total amount', () => {
    const members = [{ id: 1, weight: 3 }, { id: 2, weight: 7 }];
    const result = calculateSplits(100, 'shares', members);
    const sum = result.reduce((s, r) => Math.round((s + r.portion) * 100) / 100, 0);
    expect(sum).toBe(100);
  });

  it('shares: remainder goes to first member', () => {
    // 3 members, 1 share each, $10 → 3.33/3.33/3.33, remainder 0.01 → first gets 3.34
    const members = [{ id: 1, weight: 1 }, { id: 2, weight: 1 }, { id: 3, weight: 1 }];
    const result = calculateSplits(10, 'shares', members);
    expect(result[0].portion).toBe(3.34);
    expect(result[1].portion).toBe(3.33);
    expect(result[2].portion).toBe(3.33);
  });
});

// ---------------------------------------------------------------------------
// splitExpenseEndpoint handler
// ---------------------------------------------------------------------------

describe('splitExpenseEndpoint', () => {
  it('returns 400 when input is invalid', () => {
    const req = createReq({ group: 0, total: 100, method: 'equal', members: [] }); // invalid group + empty members
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
  });

  it('returns 400 when total is missing from request body', () => {
    const { total, ...noTotal } = validEqual;
    const req = createReq(noTotal);
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
  });

  it('returns 400 when total is not a positive number', () => {
    const req = createReq({ ...validEqual, total: -10 });
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
  });

  it('returns 401 when user is not authenticated', () => {
    const req = createReq(validEqual);
    const res = createRes({ isAuthenticated: false });

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('returns 200 with splits using the request body total for equal method', () => {
    const req = createReq(validEqual); // total: 90, 2 members
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { splits } = res._body;
    expect(splits).toHaveLength(2);
    expect(splits[0].portion).toBe(45);
    expect(splits[1].portion).toBe(45);
  });

  it('returns 200 with correct portions for percent method using request body total', () => {
    const req = createReq(validPercent); // total: 100, 50/30/20
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { splits } = res._body;
    expect(splits[0].portion).toBe(50);
    expect(splits[1].portion).toBe(30);
    expect(splits[2].portion).toBe(20);
  });

  it('returns 200 with correct portions for shares method using request body total', () => {
    const req = createReq(validShares); // total: 100, 1/1/2 shares
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { splits } = res._body;
    expect(splits[0].portion).toBe(25);
    expect(splits[1].portion).toBe(25);
    expect(splits[2].portion).toBe(50);
  });

  it('sum of returned portions always equals the request body total', () => {
    const req = createReq({ group: 1, total: 100, method: 'equal', members: membersThree });
    const res = createRes();

    splitExpenseEndpoint(null)(req, res);

    const sum = res._body.splits.reduce(
      (s, r) => Math.round((s + r.portion) * 100) / 100,
      0
    );
    expect(sum).toBe(100);
  });
});
