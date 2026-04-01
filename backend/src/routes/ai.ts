import { Router } from 'express';
import { validate, aiParseSchema } from '../middleware/validation.js';
import { parseCommand } from '../services/aiService.js';

const router = Router();

/**
 * POST /api/ai/parse
 *
 * Parse a natural language command into structured blockchain actions.
 *
 * Request:  { command: "Send 5 STRK to @tolu and stake 2 STRK" }
 * Response: { actions: [...], confidence: 0.95, clarification?: "..." }
 */
router.post('/parse', validate(aiParseSchema), async (req, res, next) => {
  try {
    const result = await parseCommand(req.body.command);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
