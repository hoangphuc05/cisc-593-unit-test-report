import splitExpenseEndpoint from '../../features/split-expense.js';
import { z } from 'zod';

const settlementInputSchema = z.object({
  group: z.number().int().positive(),
  name: z.string().nonempty(),

});

/**
 * Factory that accepts a db instance and returns the Express route handler.
 * @param {import('better-sqlite3').Database} db
 */
const suggestedSettlementEndpoint = (db) => (req, res) => {
  if (!validateInput(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  if (!res.locals.isAuthenticated) {
    return res.status(401).send('Unauthorized');
  }


  const dataObject = settlementInputSchema.safeParse(req.body).data;

  // grabs all group members from database
  const stmt = db.prepare(`
    SELECT group_id, member, group_leader, name, amount FROM groups
    JOIN expense ON groups.group_id = expense.group
    WHERE group_id = @group_id AND name = @name
  `);

  const result = stmt.run({
    group_id: dataObject.group,
    name: dataObject.name,
  });

  
  res.status(200).json({ id: result.group_id, message: 'What plan would you like to use: equal, percent, shares' });
};

export const validateInput = (data) => {
  // validate the input using the Zod schema
  const result = RecordInputSchema.safeParse(data);
  return result.success;
};

export default suggestedSettlementEndpoint;