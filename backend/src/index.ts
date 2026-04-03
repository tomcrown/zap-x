import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Routes
import userRouter from './routes/user.js';
import walletRouter from './routes/wallet.js';
import transferRouter from './routes/transfer.js';
import claimRouter from './routes/claim.js';
import stakingRouter from './routes/staking.js';
import lendingRouter from './routes/lending.js';
import aiRouter from './routes/ai.js';

// Bootstrap DB on startup
import './db/database.js';

const app = express();

// ─── Security & Parsing ────────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,
  message: { error: 'AI parse rate limit reached. Please wait.' },
});

app.use('/api', apiLimiter);
app.use('/api/ai', aiLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use('/api/users', userRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/claim', claimRouter);
app.use('/api/staking', stakingRouter);
app.use('/api/lending', lendingRouter);
app.use('/api/ai', aiRouter);

// ─── Error Handling ────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════╗
║           Zap-X Backend               ║
║  Port   : ${config.port}                         ║
║  Network: ${config.starknet.network}                   ║
║  Env    : ${config.nodeEnv}               ║
╚═══════════════════════════════════════╝
  `.trim());
});

export default app;
