import dotenv from 'dotenv';
import { ServerApiVersion } from 'mongodb';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    mongoUri: process.env.MONGODB_URI || '',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000, // Increased to 30 seconds for Atlas connections
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Connection timeout
      retryWrites: true,
      retryReads: true,
      // Stable API version for MongoDB Atlas compatibility
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    },
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: process.env.WEBHOOK_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-secret',
  },
};

// Validate required environment variables (strict in production only)
const nodeEnv = process.env.NODE_ENV || 'development';
const requiredEnvVars = [
  'MONGODB_URI',
  'OPENROUTER_API_KEY',
  'TELEGRAM_BOT_TOKEN',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    if (nodeEnv === 'production') {
      throw new Error(`Missing required environment variable: ${envVar}`);
    } else {
      console.warn(`⚠️  Warning: Missing environment variable: ${envVar}`);
      console.warn(`   Some features may not work without this variable.`);
    }
  }
}