import { Router } from "express";
import { validate, aiParseSchema } from "../middleware/validation.js";
import { parseCommand } from "../services/aiService.js";

const router = Router();

router.post("/parse", validate(aiParseSchema), async (req, res, next) => {
  try {
    const result = await parseCommand(req.body.command);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
