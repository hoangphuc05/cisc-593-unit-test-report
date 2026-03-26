import express, { json, Router } from 'express';
import { initDb } from './db.js';
import recordExpenseEndpoint from './features/record-expense.js';
import splitExpenseEndpoint from './features/split-expense.js';
import authMiddleware from './middleware/auth-middleware.js';

const app = express();
const port = 3000;

// Initialize (and create if missing) the SQLite database
const db = initDb();

app.use(json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// All routes under /auth are protected by authMiddleware
const authRouter = Router();
authRouter.use(authMiddleware);
authRouter.post('/record-expense', recordExpenseEndpoint(db));
authRouter.post('/split-expense', splitExpenseEndpoint(db));

app.use('/auth', authRouter);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});