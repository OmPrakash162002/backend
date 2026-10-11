import app from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

async function main() {
  if (!env.mongoUri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  if (env.jwtSecret.length < 32) {
    console.error('JWT_SECRET must be set to a random string of at least 32 characters (see .env.example).');
    process.exit(1);
  }
  await connectDb();
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
        console.log(env.geminiKey ? `AI: Gemini (${env.geminiModel})` : 'AI: rules-based fallback (no GEMINI_API_KEY)');
  });
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
