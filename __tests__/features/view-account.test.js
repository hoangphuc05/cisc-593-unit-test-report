import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateOffset,
  buildWhereClause,
  validateInput,
} from '../../features/view-account.js';
import viewAccountEndpoint from '../../features/view-account.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb({ balanceResult = { total: 250.75 }, transactions = [] } = {}) {
  const getStub = vi.fn().mockReturnValue(balanceResult);
  const allStub = vi.fn().mockReturnValue(transactions);
  let callCount = 0;
  const prepare = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) return { get: getStub };
    return { all: allStub };
  });
  return { prepare, _get: getStub, _all: allStub };
}

function createReq(body = {}) {
  return { body };
}

function createRes({ isAuthenticated = true, user = { id: 1, name: 'Alice' } } = {}) {
  const res = {
    locals: { isAuthenticated, user },
    statusCode: 200,
    _body: null,
  };
  res.status = vi.fn().mockImplementation((code) => { res.statusCode = code; return res; });
  res.json   = vi.fn().mockImplementation((body) => { res._body = body;  return res; });
  res.send   = vi.fn().mockImplementation((body) => { res._body = body;  return res; });
  return res;
}

// ---------------------------------------------------------------------------
// calculateOffset
// ---------------------------------------------------------------------------

describe('calculateOffset', () => {
  it('returns 0 for page 1', () => {
    expect(calculateOffset(1, 10)).toBe(0);
  });

  it('returns 10 for page 2 with pageSize 10', () => {
    expect(calculateOffset(2, 10)).toBe(10);
  });

  it('returns 10 for page 3 with pageSize 5', () => {
    expect(calculateOffset(3, 5)).toBe(10);
  });

  it('returns 80 for page 5 with pageSize 20', () => {
    expect(calculateOffset(5, 20)).toBe(80);
  });

  it('always returns 0 for page 1 regardless of pageSize', () => {
    expect(calculateOffset(1, 100)).toBe(0);
    expect(calculateOffset(1, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildWhereClause
// ---------------------------------------------------------------------------

describe('buildWhereClause', () => {
  it('returns only user_id condition when no filters are provided', () => {
    expect(buildWhereClause({})).toBe('user_id = @user_id');
  });

  it('adds category condition when category filter is provided', () => {
    const clause = buildWhereClause({ category: 'Food' });
    expect(clause).toContain('category = @category');
    expect(clause).toContain('user_id = @user_id');
  });

  it('adds date >= condition when dateFrom filter is provided', () => {
    const clause = buildWhereClause({ dateFrom: '2024-01-01' });
    expect(clause).toContain('date >= @dateFrom');
  });

  it('adds date <= condition when dateTo filter is provided', () => {
    const clause = buildWhereClause({ dateTo: '2024-12-31' });
    expect(clause).toContain('date <= @dateTo');
  });

  it('adds both date conditions when both dateFrom and dateTo are provided', () => {
    const clause = buildWhereClause({ dateFrom: '2024-01-01', dateTo: '2024-12-31' });
    expect(clause).toContain('date >= @dateFrom');
    expect(clause).toContain('date <= @dateTo');
  });

  it('adds all 4 conditions when all filters are provided', () => {
    const clause = buildWhereClause({ category: 'Food', dateFrom: '2024-01-01', dateTo: '2024-12-31' });
    expect(clause).toContain('user_id = @user_id');
    expect(clause).toContain('category = @category');
    expect(clause).toContain('date >= @dateFrom');
    expect(clause).toContain('date <= @dateTo');
  });

  it('ignores undefined filter values', () => {
    const clause = buildWhereClause({ category: undefined, dateFrom: undefined });
    expect(clause).toBe('user_id = @user_id');
  });
});

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe('validateInput', () => {
  it('returns true for an empty object (all fields have defaults)', () => {
    expect(validateInput({})).toBe(true);
  });

  it('returns true for a fully valid input', () => {
    expect(validateInput({ page: 2, pageSize: 20, category: 'Food', dateFrom: '2024-01-01', dateTo: '2024-12-31' })).toBe(true);
  });

  it('returns false when page is negative', () => {
    expect(validateInput({ page: -1 })).toBe(false);
  });

  it('returns false when page is zero', () => {
    expect(validateInput({ page: 0 })).toBe(false);
  });

  it('returns false when pageSize exceeds 100', () => {
    expect(validateInput({ pageSize: 101 })).toBe(false);
  });

  it('returns false when pageSize is zero', () => {
    expect(validateInput({ pageSize: 0 })).toBe(false);
  });

  it('returns false when page is a non-integer', () => {
    expect(validateInput({ page: 1.5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// viewAccountEndpoint handler
// ---------------------------------------------------------------------------

describe('viewAccountEndpoint', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when input is invalid', () => {
    const req = createReq({ page: -1 });
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const req = createReq({});
    const res = createRes({ isAuthenticated: false });
    viewAccountEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 200 with balance and transactions on success', () => {
    const transactions = [
      { id: 1, name: 'Groceries', amount: 50, category: 'Food', date: '2024-03-01', description: null },
      { id: 2, name: 'Taxi', amount: 15, category: 'Transport', date: '2024-03-02', description: null },
    ];
    db = createMockDb({ balanceResult: { total: 250.75 }, transactions });
    const req = createReq({});
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ balance: 250.75, page: 1, pageSize: 10, transactions });
  });

  it('returns balance of 0 when DB total is null', () => {
    db = createMockDb({ balanceResult: { total: null }, transactions: [] });
    const req = createReq({});
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ balance: 0 }));
  });

  it('queries the database with the correct user_id for balance', () => {
    const user = { id: 7, name: 'Bob' };
    const req  = createReq({});
    const res  = createRes({ user });
    viewAccountEndpoint(db)(req, res);
    expect(db._get).toHaveBeenCalledWith({ user_id: 7 });
  });

  it('passes the category filter to the history query', () => {
    const req = createReq({ category: 'Food' });
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    expect(db._all.mock.calls[0][0].category).toBe('Food');
  });

  it('correctly calculates the offset for pagination', () => {
    const req = createReq({ page: 3, pageSize: 5 });
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    const allArg = db._all.mock.calls[0][0];
    expect(allArg.offset).toBe(10);
    expect(allArg.pageSize).toBe(5);
  });

  it('returns page and pageSize values matching the request', () => {
    const req = createReq({ page: 2, pageSize: 25 });
    const res = createRes();
    viewAccountEndpoint(db)(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 25 }));
  });
});
