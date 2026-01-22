import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import App from '../app';
import { database } from '../database/connection';
import { ConversationalAIService } from '../services/ConversationalAIService';

// Mock the ConversationalAIService
jest.mock('../services/ConversationalAIService');
jest.mock('../database/connection');

describe('AI Routes', () => {
  let app: App;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let mockAIService: jest.Mocked<ConversationalAIService>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    
    // Mock database connection
    (database.connect as jest.Mock).mockResolvedValue(client.db('test'));
    (database.isConnected as jest.Mock).mockReturnValue(true);
    (database.getSchemas as jest.Mock).mockReturnValue({
      getConversationsCollection: () => client.db('test').collection('conversations'),
    });

    app = new App();

    // Get the mocked service instance
    mockAIService = new ConversationalAIService() as jest.Mocked<ConversationalAIService>;
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/ai/chat', () => {
    it('should process a chat message successfully', async () => {
      mockAIService.processMessage.mockResolvedValue({
        success: true,
        data: {
          message: 'Hello! How can I help you with your fitness journey today?',
          context: { currentActivity: undefined },
          suggestions: ['Plan my workout', 'Help with nutrition'],
          metadata: { conversationId: 'test-id' },
        },
      });

      const response = await request(app.app)
        .post('/api/ai/chat')
        .send({
          userId: '507f1f77bcf86cd799439011',
          message: 'Hello',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('Hello!');
      expect(response.body.data.suggestions).toBeDefined();
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app.app)
        .post('/api/ai/chat')
        .send({
          userId: '507f1f77bcf86cd799439011',
          // missing message
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 404 for user not found', async () => {
      mockAIService.processMessage.mockResolvedValue({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          userMessage: 'User profile not found.',
        },
      });

      const response = await request(app.app)
        .post('/api/ai/chat')
        .send({
          userId: 'nonexistent',
          message: 'Hello',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should handle AI service errors', async () => {
      mockAIService.processMessage.mockResolvedValue({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: 'AI service error',
          userMessage: 'I\'m having trouble right now.',
        },
      });

      const response = await request(app.app)
        .post('/api/ai/chat')
        .send({
          userId: '507f1f77bcf86cd799439011',
          message: 'Hello',
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/ai/onboarding/:userId', () => {
    it('should start onboarding successfully', async () => {
      mockAIService.startOnboarding.mockResolvedValue({
        success: true,
        data: {
          step: 'welcome',
          message: 'Welcome to Fit Buddy! What\'s your name?',
          expectedInput: 'user_name',
          nextStep: 'basic_info',
        },
      });

      const response = await request(app.app)
        .post('/api/ai/onboarding/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.step).toBe('welcome');
      expect(response.body.data.message).toContain('Welcome');
    });

    it('should handle onboarding errors', async () => {
      mockAIService.startOnboarding.mockResolvedValue({
        success: false,
        error: {
          code: 'ONBOARDING_ERROR',
          message: 'Failed to start onboarding',
          userMessage: 'Welcome to Fit Buddy!',
        },
      });

      const response = await request(app.app)
        .post('/api/ai/onboarding/507f1f77bcf86cd799439011')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/ai/workout-session/:userId', () => {
    it('should handle workout session successfully', async () => {
      mockAIService.handleWorkoutSession.mockResolvedValue({
        success: true,
        data: {
          message: 'How\'s your workout going? What exercise did you just finish?',
          sessionActive: true,
          exerciseLogged: false,
          sessionComplete: false,
        },
      });

      const response = await request(app.app)
        .post('/api/ai/workout-session/507f1f77bcf86cd799439011')
        .send({ sessionId: 'session123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionActive).toBe(true);
      expect(response.body.data.message).toContain('workout');
    });

    it('should return 400 for missing session ID', async () => {
      const response = await request(app.app)
        .post('/api/ai/workout-session/507f1f77bcf86cd799439011')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_SESSION_ID');
    });
  });

  describe('POST /api/ai/analyze-image/:userId', () => {
    it('should analyze image successfully', async () => {
      mockAIService.analyzeImage.mockResolvedValue({
        success: true,
        data: {
          message: 'I can see rice and chicken, approximately 450 calories total.',
          confidence: 0.8,
        },
      });

      // Create a fake image buffer
      const imageBuffer = Buffer.from('fake-image-data');

      const response = await request(app.app)
        .post('/api/ai/analyze-image/507f1f77bcf86cd799439011')
        .attach('image', imageBuffer, 'test-food.jpg')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('rice and chicken');
    });

    it('should return 400 for missing image', async () => {
      const response = await request(app.app)
        .post('/api/ai/analyze-image/507f1f77bcf86cd799439011')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NO_IMAGE_PROVIDED');
    });

    it('should handle image analysis errors', async () => {
      mockAIService.analyzeImage.mockResolvedValue({
        success: false,
        error: {
          code: 'IMAGE_ANALYSIS_ERROR',
          message: 'Failed to analyze image',
          userMessage: 'I\'m having trouble analyzing that image.',
        },
      });

      const imageBuffer = Buffer.from('fake-image-data');

      const response = await request(app.app)
        .post('/api/ai/analyze-image/507f1f77bcf86cd799439011')
        .attach('image', imageBuffer, 'test-food.jpg')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/ai/conversation/:userId', () => {
    it('should get conversation history successfully', async () => {
      mockAIService.getConversationHistory.mockResolvedValue({
        success: true,
        data: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
          { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
        ],
        metadata: {
          totalMessages: 2,
          conversationId: 'test-id',
        },
      });

      const response = await request(app.app)
        .get('/api/ai/conversation/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].content).toBe('Hello');
    });

    it('should handle conversation history with limit', async () => {
      mockAIService.getConversationHistory.mockResolvedValue({
        success: true,
        data: [
          { role: 'user', content: 'Recent message', timestamp: new Date() },
        ],
        metadata: { totalMessages: 10 },
      });

      const response = await request(app.app)
        .get('/api/ai/conversation/507f1f77bcf86cd799439011?limit=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAIService.getConversationHistory).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        1
      );
    });

    it('should handle conversation history errors', async () => {
      mockAIService.getConversationHistory.mockResolvedValue({
        success: false,
        error: {
          code: 'CONVERSATION_HISTORY_ERROR',
          message: 'Failed to get history',
          userMessage: 'Unable to retrieve conversation history.',
        },
      });

      const response = await request(app.app)
        .get('/api/ai/conversation/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/ai/test-connection', () => {
    it('should test connection successfully', async () => {
      // Mock the private openRouterClient
      const mockOpenRouterClient = {
        testConnection: jest.fn().mockResolvedValue(true),
      };
      
      // Access the private property for testing
      (mockAIService as any).openRouterClient = mockOpenRouterClient;

      const response = await request(app.app)
        .post('/api/ai/test-connection')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.connected).toBe(true);
    });

    it('should handle connection test failure', async () => {
      const mockOpenRouterClient = {
        testConnection: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };
      
      (mockAIService as any).openRouterClient = mockOpenRouterClient;

      const response = await request(app.app)
        .post('/api/ai/test-connection')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONNECTION_TEST_FAILED');
    });
  });
});