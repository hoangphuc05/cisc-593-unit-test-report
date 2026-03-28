import { z } from 'zod';
import bcrypt from 'bcrypt';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const PasswordLoginSchema = z.object({
  username: z.string().nonempty(),
  password: z.string().min(8),
});

const BiometricLoginSchema = z.object({
  username: z.string().nonempty(),
  biometric_token: z.string().nonempty(),
});

// ---------------------------------------------------------------------------
// Pure helper functions (easy to unit test)
// ---------------------------------------------------------------------------

const SALT_ROUNDS = 10;

/**
 * Hash a plain-text password.
 * @param {string} plainText
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(plainText) {
  return await bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored hash.
 * @param {string} plainText
 * @param {string} hashedPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainText, hashedPassword) {
  return await bcrypt.compare(plainText, hashedPassword);
}

/**
 * Validate password-login input shape.
 * @param {unknown} data
 * @returns {boolean}
 */
export const validatePasswordLogin = (data) =>
  PasswordLoginSchema.safeParse(data).success;

/**
 * Validate biometric-login input shape.
 * @param {unknown} data
 * @returns {boolean}
 */
export const validateBiometricLogin = (data) =>
  BiometricLoginSchema.safeParse(data).success;

// ---------------------------------------------------------------------------
// Express route handler factory
// ---------------------------------------------------------------------------

/**
 * Factory that accepts a db instance and returns the Express route handler.
 * Supports two login paths:
 *   GET/POST ?method=biometric  ->  biometric token check
 *   GET/POST (default)          ->  username + password check
 *
 * @param {import('better-sqlite3').Database} db
 */
const authenticateEndpoint = (db) => async (req, res) => {
  const method = req.query?.method ?? 'password';

  // ------------------------------------------------------------------
  // Biometric login path
  // ------------------------------------------------------------------
  if (method === 'biometric') {
    if (!validateBiometricLogin(req.body)) {
      return res.status(400).send('Invalid input data');
    }

    const stmt = db.prepare(
      'SELECT * FROM users WHERE username = @username'
    );
    const user = stmt.get({ username: req.body.username });

    if (!user || user.biometric_token !== req.body.biometric_token) {
      return res.status(401).send('Unauthorized');
    }

    return res.status(200).json({
      message: 'Biometric login successful',
      userId: user.id,
    });
  }

  // ------------------------------------------------------------------
  // Password login path (default)
  // ------------------------------------------------------------------
  if (!validatePasswordLogin(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  const stmt = db.prepare(
    'SELECT * FROM users WHERE username = @username'
  );
  const user = stmt.get({ username: req.body.username });

  if (!user) {
    return res.status(401).send('Unauthorized');
  }

  const isValid = await verifyPassword(req.body.password, user.password_hash);

  if (!isValid) {
    return res.status(401).send('Unauthorized');
  }

  return res.status(200).json({
    message: 'Login successful',
    userId: user.id,
  });
};

export default authenticateEndpoint;
