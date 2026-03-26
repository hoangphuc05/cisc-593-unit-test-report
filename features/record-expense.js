import { z } from 'zod';

const RecordInputSchema = z.object({
  name: z.string().nonempty(),
  amount: z.number().positive(),
  category: z.string().optional(),
  date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  description: z.string().optional(),
  group: z.number().int().positive(),
});

/**
 * Factory that accepts a db instance and returns the Express route handler.
 * @param {import('better-sqlite3').Database} db
 */
const recordExpenseEndpoint = (db) => (req, res) => {
  if (!validateInput(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  if (!res.locals.isAuthenticated) {
    return res.status(401).send('Unauthorized');
  }

  const userId = res.locals.user.id;

  const dataObject = RecordInputSchema.safeParse(req.body).data;

  // Insert the validated expense into the database
  const stmt = db.prepare(`
    INSERT INTO expenses (user_id, name, amount, category, date, description, group_id)
    VALUES (@user_id, @name, @amount, @category, @date, @description, @group_id)
  `);

  const result = stmt.run({
    user_id: userId,
    name: dataObject.name,
    amount: dataObject.amount,
    category: dataObject.category ?? null,
    date: dataObject.date,
    description: dataObject.description ?? null,
    group_id: dataObject.group,
  });

  res.status(201).json({ id: result.lastInsertRowid, message: 'Expense recorded successfully!' });
};

export const validateInput = (data) => {
  // validate the input using the Zod schema
  const result = RecordInputSchema.safeParse(data);
  return result.success;
};

export default recordExpenseEndpoint;