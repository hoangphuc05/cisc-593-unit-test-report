import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateInput } from '../../features/suggested-settlement.js';
import suggestedSettlementEndpoint from '../../features/suggested-settlement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock db whose prepare().run() is a spy. */
function createMockDb(runReturnValue = { group_id: 1 }) {
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

const validExpense = {
    group: 1,
    name: 'Groceries',
};

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe('validateInput', () => {
  it('returns true for a fully valid expense', () => {
    expect(validateInput(validExpense)).toBe(true);
  });

  it('returns true when group is provided as a positive integer', () => {
    expect(validateInput({group: 3, name: 'Groceries'})).toBe(true);
  });

  it('returns false when group is missing', () => {
    ;
    expect(validateInput(validExpense.name)).toBe(false);
  });

  it('returns false when group is zero', () => {
    expect(validateInput({ ...validExpense, group: 0 })).toBe(false);
  });

  it('returns false when group is a string', () => {
    expect(validateInput({ ...validExpense, group: 'abc' })).toBe(false);
  });

  it('returns false when name is missing', () => {
    const { name, ...rest } = validExpense;
    expect(validateInput(rest)).toBe(false);
  });

  it('returns false when name is an empty string', () => {
    expect(validateInput({ ...validExpense, name: '' })).toBe(false);
  });

  it('returns false for completely empty input', () => {
    expect(validateInput({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// suggestedSettlementEndpoint handler
// ---------------------------------------------------------------------------

describe('suggestedSettlementEndpoint', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when input is invalid', () => {
    const req = createReq({ name: '', amount: -5, date: 'bad' });
    const res = createRes();

    suggestedSettlementEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const req = createReq(validExpense);
    const res = createRes({ isAuthenticated: false });

    suggestedSettlementEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('inserts the expense and returns 201 with the new id on success', () => {
    db = createMockDb({ lastInsertRowid: 42 });
    const req = createReq(validExpense);
    const res = createRes();

    suggestedSettlementEndpoint(db)(req, res);

    expect(db.prepare).toHaveBeenCalledOnce();
    expect(db._run).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      message: 'What plan would you like to use: equal, percent, shares',
    });
  });

  it('inserts the provided group id when group is supplied', () => {
    const req = createReq({ ...validExpense, group: 7 });
    const res = createRes();

    suggestedSettlementEndpoint(db)(req, res);

    const runArg = db._run.mock.calls[0][0];
    expect(runArg.group_id).toBe(7);
  });
  
});