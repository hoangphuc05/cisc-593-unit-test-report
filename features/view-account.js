import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const ViewAccountSchema = z.object({
  page:     z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  category: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
});

// ---------------------------------------------------------------------------
// Pure helper functions (easy to unit test)
// ---------------------------------------------------------------------------

/**
 * Calculate the SQL OFFSET for a given page and page size.
 * @param {number} page      - 1-based page number
 * @param {number} pageSize  - number of records per page
 * @returns {number}
 */
export function calculateOffset(page, pageSize) {
  return (page - 1) * pageSize;
}

/**
 * Build a SQL WHERE clause string based on which filters are present.
 * Always includes user_id; other conditions are appended when supplied.
 *
 * @param {{ category?: string, dateFrom?: string, dateTo?: string }} filters
 * @returns {string}  e.g. "user_id = @user_id AND category = @category"
 */
export function buildWhereClause(filters) {
  const conditions = ['user_id = @user_id'];

  if (filters.category !== undefined && filters.category !== null) {
    conditions.push('category = @category');
  }
  if (filters.dateFrom !== undefined && filters.dateFrom !== null) {
    conditions.push('date >= @dateFrom');
  }
  if (filters.dateTo !== undefined && filters.dateTo !== null) {
    conditions.push('date <= @dateTo');
  }

  return conditions.join(' AND ');
}

/**
 * Validate view-account request input.
 * Empty body is valid because all fields have defaults.
 * @param {unknown} data
 * @returns {boolean}
 */
export const validateInput = (data) =>
  ViewAccountSchema.safeParse(data).success;

// ---------------------------------------------------------------------------
// Express route handler factory
// ---------------------------------------------------------------------------

/**
 * Factory that accepts a db instance and returns the Express route handler.
 * Returns the authenticated user's balance and paginated transaction history.
 *
 * @param {import('better-sqlite3').Database} db
 */
const viewAccountEndpoint = (db) => (req, res) => {
  if (!validateInput(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  if (!res.locals.isAuthenticated) {
    return res.status(401).send('Unauthorized');
  }

  const userId = res.locals.user.id;
  const data   = ViewAccountSchema.safeParse(req.body).data;
  const offset = calculateOffset(data.page, data.pageSize);
  const where  = buildWhereClause(data);

  // Query 1: total balance for this user
  const balanceStmt = db.prepare(
    'SELECT SUM(amount) as total FROM expenses WHERE user_id = @user_id'
  );
  const balanceResult = balanceStmt.get({ user_id: userId });

  // Query 2: filtered + paginated transaction history
  const historyStmt = db.prepare(`
    SELECT id, name, amount, category, date, description
    FROM expenses
    WHERE ${where}
    ORDER BY date DESC
    LIMIT @pageSize OFFSET @offset
  `);
  const transactions = historyStmt.all({
    user_id:  userId,
    category: data.category ?? null,
    dateFrom: data.dateFrom ?? null,
    dateTo:   data.dateTo   ?? null,
    pageSize: data.pageSize,
    offset,
  });

  return res.status(200).json({
    balance:      balanceResult?.total ?? 0,
    page:         data.page,
    pageSize:     data.pageSize,
    transactions,
  });
};

export default viewAccountEndpoint;
