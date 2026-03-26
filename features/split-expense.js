import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const MemberSchema = z.object({
  id: z.number().int().positive(),
  weight: z.number().optional(),
});

const SplitInputSchema = z
  .object({
    group: z.number().int().positive(),
    total: z.number().positive(),
    method: z.enum(['equal', 'percent', 'shares']),
    members: z.array(MemberSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'percent') {
      const allHaveWeight = data.members.every((m) => m.weight !== undefined);
      if (!allHaveWeight) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each member must have a weight when method is "percent"',
        });
        return;
      }
      const total = data.members.reduce((sum, m) => sum + m.weight, 0);
      if (Math.abs(total - 100) > 0.0001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Weights must sum to 100 when method is "percent"',
        });
      }
    }

    if (data.method === 'shares') {
      const allValid = data.members.every(
        (m) => m.weight !== undefined && Number.isInteger(m.weight) && m.weight >= 1
      );
      if (!allValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each member must have an integer weight >= 1 when method is "shares"',
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Pure splitting logic
// ---------------------------------------------------------------------------

/**
 * Calculate each member's portion of an expense.
 *
 * Rounding rule: every portion is floored to 2 decimal places.
 * Any leftover remainder (due to rounding) is added to the first member.
 * This guarantees sum(portions) === amount exactly.
 *
 * @param {number} amount  - Total expense amount (positive)
 * @param {'equal'|'percent'|'shares'} method
 * @param {{ id: number, weight?: number }[]} members
 * @returns {{ memberId: number, portion: number }[]}
 */
export function calculateSplits(amount, method, members) {
  const n = members.length;
  let rawPortions;

  if (method === 'equal') {
    rawPortions = members.map(() => amount / n);
  } else if (method === 'percent') {
    rawPortions = members.map((m) => (amount * m.weight) / 100);
  } else {
    // shares
    const totalShares = members.reduce((sum, m) => sum + m.weight, 0);
    rawPortions = members.map((m) => (amount * m.weight) / totalShares);
  }

  // Floor each portion to 2 decimal places
  const floored = rawPortions.map((p) => Math.floor(p * 100) / 100);

  // Calculate remainder and assign it to the first member
  const distributed = floored.reduce((sum, p) => sum + p, 0);
  const remainder = Math.round((amount - distributed) * 100) / 100;
  floored[0] = Math.round((floored[0] + remainder) * 100) / 100;

  return members.map((m, i) => ({ memberId: m.id, portion: floored[i] }));
}

// ---------------------------------------------------------------------------
// Input validation helper
// ---------------------------------------------------------------------------

/**
 * @param {unknown} data
 * @returns {boolean}
 */
export const validateSplitInput = (data) => SplitInputSchema.safeParse(data).success;

// ---------------------------------------------------------------------------
// Express route handler factory
// ---------------------------------------------------------------------------

/**
 * @param {import('better-sqlite3').Database} db
 */
const splitExpenseEndpoint = (db) => (req, res) => {
  if (!validateSplitInput(req.body)) {
    return res.status(400).send('Invalid input data');
  }

  if (!res.locals.isAuthenticated) {
    return res.status(401).send('Unauthorized');
  }

  const { total, method, members } = SplitInputSchema.safeParse(req.body).data;

  const splits = calculateSplits(total, method, members);

  return res.status(200).json({ splits });
};

export default splitExpenseEndpoint;
