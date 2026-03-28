import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  validatePasswordLogin,
  validateBiometricLogin,
} from '../../features/authenticate.js';
import authenticateEndpoint from '../../features/authenticate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb(returnValue = null) {
  const get     = vi.fn().mockReturnValue(returnValue);
  const prepare = vi.fn().mockReturnValue({ get });
  return { prepare, _get: get };
}

function createReq(body = {}, query = {}) {
  return { body, query };
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

const validPasswordBody  = { username: 'alice', password: 'securepassword123' };
const validBiometricBody = { username: 'alice', biometric_token: 'bio-token-xyz' };

// ---------------------------------------------------------------------------
// hashPassword
// ---------------------------------------------------------------------------

describe('hashPassword', () => {
  it('returns a value different from the original plaintext', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).not.toBe('mypassword');
  });

  it('returns a string', async () => {
    const hash = await hashPassword('mypassword');
    expect(typeof hash).toBe('string');
  });

  it('produces a different hash each call for the same input (bcrypt salting)', async () => {
    const hash1 = await hashPassword('mypassword');
    const hash2 = await hashPassword('mypassword');
    expect(hash1).not.toBe(hash2);
  });

  it('hash starts with $2b$ (valid bcrypt format)', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash.startsWith('$2b$')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyPassword
// ---------------------------------------------------------------------------

describe('verifyPassword', () => {
  it('returns true when the correct password is compared against its hash', async () => {
    const hash = await hashPassword('correctpassword');
    expect(await verifyPassword('correctpassword', hash)).toBe(true);
  });

  it('returns false when the wrong password is compared against the hash', async () => {
    const hash = await hashPassword('correctpassword');
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('returns false when an empty string is compared against the hash', async () => {
    const hash = await hashPassword('correctpassword');
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('hashPassword and verifyPassword work correctly together', async () => {
    const plain = 'Integration@123';
    const hash  = await hashPassword(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordLogin
// ---------------------------------------------------------------------------

describe('validatePasswordLogin', () => {
  it('returns true for a valid username and password', () => {
    expect(validatePasswordLogin(validPasswordBody)).toBe(true);
  });

  it('returns false when password is shorter than 8 characters', () => {
    expect(validatePasswordLogin({ username: 'alice', password: 'short' })).toBe(false);
  });

  it('returns false when username is missing', () => {
    expect(validatePasswordLogin({ password: 'securepassword123' })).toBe(false);
  });

  it('returns false when username is an empty string', () => {
    expect(validatePasswordLogin({ username: '', password: 'securepassword123' })).toBe(false);
  });

  it('returns false when password is missing', () => {
    expect(validatePasswordLogin({ username: 'alice' })).toBe(false);
  });

  it('returns false for a completely empty object', () => {
    expect(validatePasswordLogin({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateBiometricLogin
// ---------------------------------------------------------------------------

describe('validateBiometricLogin', () => {
  it('returns true for a valid username and biometric_token', () => {
    expect(validateBiometricLogin(validBiometricBody)).toBe(true);
  });

  it('returns false when username is missing', () => {
    expect(validateBiometricLogin({ biometric_token: 'bio-token-xyz' })).toBe(false);
  });

  it('returns false when biometric_token is missing', () => {
    expect(validateBiometricLogin({ username: 'alice' })).toBe(false);
  });

  it('returns false when biometric_token is an empty string', () => {
    expect(validateBiometricLogin({ username: 'alice', biometric_token: '' })).toBe(false);
  });

  it('returns false for a completely empty object', () => {
    expect(validateBiometricLogin({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// authenticateEndpoint -- password login
// ---------------------------------------------------------------------------

describe('authenticateEndpoint (password login)', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when input is invalid', async () => {
    const req = createReq({ username: '', password: '123' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not found in the database', async () => {
    db = createMockDb(null);
    const req = createReq(validPasswordBody);
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('returns 401 when the password is incorrect', async () => {
    const realHash = await hashPassword('correctpassword');
    db = createMockDb({ id: 1, username: 'alice', password_hash: realHash });
    const req = createReq({ username: 'alice', password: 'wrongpassword1' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('returns 200 with userId when credentials are correct', async () => {
    const realHash = await hashPassword('securepassword123');
    db = createMockDb({ id: 5, username: 'alice', password_hash: realHash });
    const req = createReq(validPasswordBody);
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Login successful', userId: 5 });
  });

  it('queries the database with the correct username', async () => {
    const realHash = await hashPassword('securepassword123');
    db = createMockDb({ id: 1, username: 'alice', password_hash: realHash });
    const req = createReq(validPasswordBody);
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(db._get).toHaveBeenCalledWith({ username: 'alice' });
  });
});

// ---------------------------------------------------------------------------
// authenticateEndpoint -- biometric login
// ---------------------------------------------------------------------------

describe('authenticateEndpoint (biometric login)', () => {
  let db;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns 400 when biometric input is invalid', async () => {
    const req = createReq({ username: '', biometric_token: '' }, { method: 'biometric' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input data');
  });

  it('returns 401 when user is not found in the database', async () => {
    db = createMockDb(null);
    const req = createReq(validBiometricBody, { method: 'biometric' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('returns 401 when biometric_token does not match', async () => {
    db = createMockDb({ id: 1, username: 'alice', biometric_token: 'correct-token' });
    const req = createReq({ username: 'alice', biometric_token: 'wrong-token' }, { method: 'biometric' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('returns 200 with userId when biometric_token is correct', async () => {
    db = createMockDb({ id: 3, username: 'alice', biometric_token: 'bio-token-xyz' });
    const req = createReq(validBiometricBody, { method: 'biometric' });
    const res = createRes();
    await authenticateEndpoint(db)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Biometric login successful', userId: 3 });
  });
});
