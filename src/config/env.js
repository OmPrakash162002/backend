import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};
