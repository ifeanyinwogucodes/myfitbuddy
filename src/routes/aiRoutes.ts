import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ConversationalAIService } from '../services/ConversationalAIService';

// Extend Request type to include file property
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const router = Router();
const aiService = new ConversationalAIService();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * POST /api/ai/chat - Send a message to the AI
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { userId, message, context } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'userId and message are required',
          userMessage: 'Please provide a message to send.',
        },
      });
    }

    const result = await aiService.processMessage(userId, message, context);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in POST /ai/chat:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'I\'m having trouble right now. Please try again in a moment.',
      },
    });
  }
});

/**
 * POST /api/ai/onboarding/:userId - Start onboarding process
 */
router.post('/onboarding/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await aiService.startOnboarding(userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in POST /ai/onboarding:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Welcome to Fit Buddy! Let\'s get started with your fitness journey.',
      },
    });
  }
});

/**
 * POST /api/ai/workout-session/:userId - Handle workout session interaction
 */
router.post('/workout-session/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'sessionId is required',
          userMessage: 'Session information is missing.',
        },
      });
    }

    const result = await aiService.handleWorkoutSession(userId, sessionId);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in POST /ai/workout-session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'How\'s your workout going? Let me know what you\'re working on!',
      },
    });
  }
});

/**
 * POST /api/ai/analyze-image/:userId - Analyze food image
 */
router.post('/analyze-image/:userId', upload.single('image'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { context = 'food_analysis' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_IMAGE_PROVIDED',
          message: 'No image file provided',
          userMessage: 'Please upload an image to analyze.',
        },
      });
    }

    const result = await aiService.analyzeImage(userId, req.file.buffer, context);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in POST /ai/analyze-image:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'I\'m having trouble analyzing that image. Could you describe what you\'re eating instead?',
      },
    });
  }
});

/**
 * GET /api/ai/conversation/:userId - Get conversation history
 */
router.get('/conversation/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await aiService.getConversationHistory(userId, limit);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in GET /ai/conversation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Unable to retrieve conversation history.',
      },
    });
  }
});

/**
 * POST /api/ai/test-connection - Test OpenRouter connection
 */
router.post('/test-connection', async (_req: Request, res: Response) => {
  try {
    // Access the private openRouterClient for testing
    const openRouterClient = (aiService as any).openRouterClient;
    const isConnected = await openRouterClient.testConnection();

    res.json({
      success: true,
      data: {
        connected: isConnected,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error testing OpenRouter connection:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONNECTION_TEST_FAILED',
        message: 'Failed to test connection',
        userMessage: 'Unable to test AI service connection.',
      },
    });
  }
});

// Error handler for multer
router.use((error: any, _req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds limit',
          userMessage: 'The image file is too large. Please use a smaller image.',
        },
      });
    }
  }

  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: 'Invalid file type',
        userMessage: 'Please upload an image file (JPG, PNG, etc.).',
      },
    });
  }

  next(error);
});

export default router;