import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate, registerUserSchema } from '../middleware/validation.js';
import {
  registerUser,
  lookupByIdentifier,
  lookupByAddress,
} from '../services/walletService.js';

const router = Router();

// POST /api/users/register
router.post('/register', requireAuth as any, validate(registerUserSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await registerUser({
      walletAddress: req.body.walletAddress,
      username: req.body.username,
      email: req.body.email ?? req.user?.email,
      privyUserId: req.user?.privyUserId,
    });
    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me
router.get('/me', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await lookupByAddress(req.user!.walletAddress);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Please register first.' });
      return;
    }
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/lookup/:identifier
router.get('/lookup/:identifier', async (req, res, next) => {
  try {
    const profile = await lookupByIdentifier(req.params.identifier);
    if (!profile) {
      res.status(404).json({ found: false, message: 'User not found.' });
      return;
    }
    res.json({
      found: true,
      walletAddress: profile.walletAddress,
      username: profile.username,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
