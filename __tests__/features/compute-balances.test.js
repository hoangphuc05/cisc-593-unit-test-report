import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateInput } from '../../features/compute-balances.js';
import computeBalanceEndpoint from '../../features/compute-balances.js';

/** Build a minimal mock db whose prepare().run() is a spy. */
function createMockDb(runReturnValue = { name: 'Groceries',
  amount: 75.5,
  category: 'Food',
  date: '2024-03-01',
  description: 'Weekly shopping',
  group: 1,}) {
  const run = vi.fn().mockReturnValue(runReturnValue);
  const prepare = vi.fn().mockReturnValue({ run });
  return { prepare, _run: run };
}

/** Build a mock Express req object. */
function createReq(body = {}) {
  return { body };
}

/** Build a mock Express res object whose methods are chainable spies. */
function createRes({ isAuthenticated = true, user = { id: 1, name: 'John Doe' } } = {}) {
  const res = {
    locals: { isAuthenticated, user },
    statusCode: 200,
    _body: null,
  };
  res.status = vi.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body) => {
    res._body = body;
    return res;
  });
  res.send = vi.fn().mockImplementation((body) => {
    res._body = body;
    return res;
  });
  return res;
}

validGroup = 1;

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe('validateInput', () => {
  it('returns true for a fully valid expense', () => {
    expect(validateInput(1)).toBe(true);
  });
  it('returns true for a fully valid expense', () => {
    expect(validateInput(-1)).toBe(false);
  });
  it('returns true when optional fields (category, description) are omitted', () => {
    expect(validateInput({})).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// computeBalanceEndpoint handler
// ---------------------------------------------------------------------------


describe('computeBalanceEndpoint', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when input is invalid', () => {
    const req = createReq({ group: -1});
    const res = createRes();

    computeBalanceEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
    expect(db.prepare).not.toHaveBeenCalled();
    });

    it('returns 401 when user is not authenticated', () => {
    const req = createReq(validGroup);
    const res = createRes({ isAuthenticated: false });

    computeBalanceEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const req = createReq(validGroup);
    const res = createRes({ isAuthenticated: false });

    computeBalanceEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(db.prepare).not.toHaveBeenCalled();
  });
  it('inserts the expense and returns 201 with the new id on success', () => {
      db = createMockDb({ lastInsertRowid: 42 });
      const req = createReq(validExpense);
      const res = createRes();
  
      computeBalanceEndpoint(db)(req, res);
  
      expect(db.prepare).toHaveBeenCalledOnce();
      expect(db._run).toHaveBeenCalledOnce();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 1,
        message: "group balnce is" + 75.5 + "amount is" + {name: Groceries, amount: 75.5},
      });
    });

});