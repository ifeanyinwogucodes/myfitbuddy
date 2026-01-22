import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { database } from './database/connection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import aiRoutes from './routes/aiRoutes';
import telegramRoutes, { getTelegramService } from './routes/telegramRoutes';

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : true,
      credentials: true,
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    if (config.server.nodeEnv !== 'test') {
      this.app.use(morgan('combined'));
    }
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        success: true,
        message: 'Fit Buddy API is running',
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
        database: database.isConnected() ? 'connected' : 'disconnected',
      });
    });

    // API routes
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/ai', aiRoutes);
    this.app.use('/api/telegram', telegramRoutes);

    // API info endpoint
    this.app.use('/api', (_req, res) => {
      res.json({
        success: true,
        message: 'Fit Buddy API v1.0',
        endpoints: {
          health: '/health',
          users: '/api/users',
          ai: '/api/ai',
          telegram: '/api/telegram',
          // More endpoints will be added as we build services
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);
    
    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database (optional in development)
      try {
        await database.connect();
      } catch (error) {
        if (config.server.nodeEnv === 'production') {
          console.error('❌ Database connection is required in production');
          throw error;
        } else {
          console.error('⚠️  Database connection failed, continuing in development mode...');
          console.error('   Some features may not work without a database connection.');
        }
      }
      
      // Start Telegram bot
      try {
        const { getTelegramService } = await import('./routes/telegramRoutes');
        const telegramService = getTelegramService();
        await telegramService.start();
      } catch (error) {
        console.error('Failed to start Telegram bot:', error);
        console.log('⚠️  Continuing without Telegram bot...');
      }
      
      // Start server
      const port = config.server.port;
      this.app.listen(port, () => {
        console.log(`🚀 Fit Buddy server running on port ${port}`);
        console.log(`📊 Environment: ${config.server.nodeEnv}`);
        console.log(`🔗 Health check: http://localhost:${port}/health`);
        console.log(`👤 Users API: http://localhost:${port}/api/users`);
        console.log(`🤖 AI API: http://localhost:${port}/api/ai`);
        console.log(`📱 Telegram API: http://localhost:${port}/api/telegram`);
        if (!database.isConnected()) {
          console.log(`⚠️  Database: Not connected (running in limited mode)`);
        }
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      // Stop Telegram bot
      try {
        const { getTelegramService } = await import('./routes/telegramRoutes');
        const telegramService = getTelegramService();
        await telegramService.stop();
      } catch (error) {
        console.error('Error stopping Telegram bot:', error);
      }
      
      await database.disconnect();
      console.log('Server stopped gracefully');
    } catch (error) {
      console.error('Error stopping server:', error);
    }
  }
}

export default App;