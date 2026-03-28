/**
 * Factory that accepts a db instance and returns the Express route handler.
 * @param {import('better-sqlite3').Database} db
 */
const viewHistoryEndpoint = (db) => (req, res) => {
  if (!validateInput(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  if (!res.locals.isAuthenticated) {
    return res.status(401).send('Unauthorized');
  }
  const userId = res.locals.user.id;



  // grabs user history from database
  const stmt = db.prepare(`
    SELECT group_id, member, group_leader, name, amount FROM history
    WHERE user_id = @user_id
  `);

  const result = stmt.run({
    user_id: userId,
  });

  
  res.status(200).json({ id: result.user_id, message: 'See history' });
};

export default viewHistoryEndpoint;