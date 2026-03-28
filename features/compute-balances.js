import { z } from 'zod';



const GroupBalenceSchema = z
  .object({
    group: z.number().int().positive(),
  })


  /**
 * Factory that accepts a db instance and returns the Express route handler.
 * @param {import('better-sqlite3').Database} db
 */
const computeBalanceEndpoint = (db) => (req, res) => {
    if (!validateInput(req.body)) {
        return res.status(400).send('Invalid input data');
      }
    
      if (!res.locals.isAuthenticated) {
        return res.status(401).send('Unauthorized');
      }
    
      const dataObject = GroupBalenceSchema.safeParse(req.body).data;

      // Grabs all records from expenses that match group id
      const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE group = @group_id
  `);

  const result = stmt.run({
    group_id: dataObject.group
  });

  const balance = [];
  const sum = 0;
  result.data.forEach(element => {
        balance.append({name: element.name, amount: element.amount});
        sum = sum + element.amount;
        
  });
  res.status(200).json({ id: result.group_id, message: "group balnce is" + sum + "amount is" + balance});
};

export const validateInput = (data) => {
  // validate the input using the Zod schema
  const result = RecordInputSchema.safeParse(data);
  return result.success;
};
export default computeBalanceEndpoint;