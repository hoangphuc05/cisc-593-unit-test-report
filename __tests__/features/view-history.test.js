import { describe, it, expect, vi, beforeEach } from 'vitest';
import viewHistoryEndpoint from '../../features/view-history.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock db whose prepare().run() is a spy. */
function createMockDb(runReturnValue = { id: 1 }) {
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

// ---------------------------------------------------------------------------
// viewHistoryEndpoint handler
// ---------------------------------------------------------------------------

describe('viewHistoryEndpoint', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when input is invalid', () => {
    const req = createReq({ name: '', amount: -5, date: 'bad' });
    const res = createRes();

    viewHistoryEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const req = createReq(validExpense);
    const res = createRes({ isAuthenticated: false });

    viewHistoryEndpoint(db)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('inserts the expense and returns 201 with the new id on success', () => {
    db = createMockDb({ lastInsertRowid: 42 });
    const req = createReq(validExpense);
    const res = createRes();

    viewHistoryEndpoint(db)(req, res);

    expect(db.prepare).toHaveBeenCalledOnce();
    expect(db._run).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      message: 'See history!',
    });
  });


  it('inserts the correct user_id from res.locals.user', () => {
    const user = { id: 7, name: 'Alice' };
    const req = createReq(validExpense);
    const res = createRes({ user });

    viewHistoryEndpoint(db)(req, res);

    const runArg = db._run.mock.calls[0][0];
    expect(runArg.user_id).toBe(user.id);
  });

});