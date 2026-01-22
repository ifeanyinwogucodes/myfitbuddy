import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { ConversationalAIService } from '../services/ConversationalAIService';
import { OpenRouterClient } from '../services/OpenRouterClient';
import { UserService } from '../services/UserService';
import { DatabaseSchemas } from '../database/schemas';
import { database } from '../database/connection';

// Mock the dependencies
jest.mock('../services/OpenRouterClient');
jest.mock('../services/UserService');
jest.mock('../database/connection');

describe('ConversationalAIService', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let schemas: DatabaseSchemas;
  let aiService: ConversationalAIService;
  let mockOpenRouterClient: jest.Mocked<OpenRouterClient>;
  let mockUserService: jest.Mocked<UserService>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test');
    schemas = new DatabaseSchemas(db);
    await schemas.createIndexes();

    // Mock the database connection methods
    (database.getSchemas as jest.Mock).mockReturnValue(schemas);
    (database.isConnected as jest.Mock).mockReturnValue(true);

    // Create mocked instances
    mockOpenRouterClient = new OpenRouterClient() as jest.Mocked<OpenRouterClient>;
    mockUserService = new UserService() as jest.Mocked<UserService>;

    aiService = new ConversationalAIService();
    
    // Replace the private instances with mocks
    (aiService as any).openRouterClient = mockOpenRouterClient;
    (aiService as any).userService = mockUserService;
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await schemas.getConversationsCollection().deleteMany({});
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('processMessage', () => {
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      profile: {
        name: 'John Doe',
        age: 25,
        height: 175,
        weight: 70,
        bmi: 22.9,
        fitnessGoal: 'bulk' as const,
        trainingPhilosophy: 'arnold' as const,
        experienceLevel: 'intermediate' as const,
      },
      preferences: {
        reminderFrequency: 'daily',
        humorEnabled: true,
        conversationStyle: 'casual' as const,
      },
      schedule: {
        workDays: ['Monday', 'Tuesday'],
        availableHours: [],
        preferredWorkoutDuration: 60,
        workoutDaysPerWeek: 3,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: mockUser,
      });

      mockOpenRouterClient.generateResponse.mockResolvedValue(
        'Great to hear from you! How can I help with your fitness journey today?'
      );
    });

    it('should process a message successfully', async () => {
      const result = await aiService.processMessage('507f1f77bcf86cd799439011', 'Hello');

      expect(result.success).toBe(true);
      expect(result.data?.message).toBe('Great to hear from you! How can I help with your fitness journey today?');
      expect(result.data?.suggestions).toBeDefined();
      expect(result.data?.context).toBeDefined();
    });

    it('should create a new conversation for first message', async () => {
      await aiService.processMessage('507f1f77bcf86cd799439011', 'Hello');

      const conversations = await schemas.getConversationsCollection().find({}).toArray();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].messages).toHaveLength(2); // user + assistant
    });

    it('should add to existing conversation', async () => {
      // First message
      await aiService.processMessage('507f1f77bcf86cd799439011', 'Hello');
      
      // Second message
      await aiService.processMessage('507f1f77bcf86cd799439011', 'How are you?');

      const conversations = await schemas.getConversationsCollection().find({}).toArray();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].messages).toHaveLength(4); // 2 user + 2 assistant
    });

    it('should detect workout context from message', async () => {
      const result = await aiService.processMessage(
        '507f1f77bcf86cd799439011', 
        'I\'m at the gym right now'
      );

      expect(result.success).toBe(true);
      expect(result.data?.context?.currentActivity).toBe('workout');
    });

    it('should detect meal planning context from message', async () => {
      const result = await aiService.processMessage(
        '507f1f77bcf86cd799439011', 
        'What should I eat for breakfast?'
      );

      expect(result.success).toBe(true);
      expect(result.data?.context?.currentActivity).toBe('meal_planning');
    });

    it('should handle user not found error', async () => {
      mockUserService.getUserById.mockResolvedValue({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });

      const result = await aiService.processMessage('invalid-id', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
    });

    it('should handle OpenRouter API errors gracefully', async () => {
      mockOpenRouterClient.generateResponse.mockRejectedValue(
        new Error('API Error')
      );

      const result = await aiService.processMessage('507f1f77bcf86cd799439011', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('trouble understanding');
    });

    it('should generate appropriate suggestions based on context', async () => {
      const result = await aiService.processMessage(
        '507f1f77bcf86cd799439011', 
        'I want to start working out'
      );

      expect(result.success).toBe(true);
      expect(result.data?.suggestions).toContain('Plan my workout');
    });
  });

  describe('startOnboarding', () => {
    beforeEach(() => {
      mockOpenRouterClient.generateResponse.mockResolvedValue(
        'Welcome to Fit Buddy! I\'m excited to help you on your fitness journey. What\'s your name?'
      );
    });

    it('should start onboarding successfully', async () => {
      const result = await aiService.startOnboarding('507f1f77bcf86cd799439011');

      expect(result.success).toBe(true);
      expect(result.data?.step).toBe('welcome');
      expect(result.data?.message).toContain('Welcome to Fit Buddy');
      expect(result.data?.expectedInput).toBe('user_name');
    });

    it('should create conversation with onboarding context', async () => {
      await aiService.startOnboarding('507f1f77bcf86cd799439011');

      const conversations = await schemas.getConversationsCollection().find({}).toArray();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].context.currentActivity).toBe('onboarding');
    });

    it('should handle onboarding errors gracefully', async () => {
      mockOpenRouterClient.generateResponse.mockRejectedValue(
        new Error('Onboarding failed')
      );

      const result = await aiService.startOnboarding('507f1f77bcf86cd799439011');

      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('Welcome to Fit Buddy');
    });
  });

  describe('handleWorkoutSession', () => {
    beforeEach(() => {
      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439011',
          profile: {
            name: 'John',
            fitnessGoal: 'bulk',
          },
        } as any,
      });

      mockOpenRouterClient.generateResponse.mockResolvedValue(
        'How\'s your workout going? What exercise did you just finish?'
      );
    });

    it('should handle workout session check-in', async () => {
      const result = await aiService.handleWorkoutSession(
        '507f1f77bcf86cd799439011',
        'session123'
      );

      expect(result.success).toBe(true);
      expect(result.data?.sessionActive).toBe(true);
      expect(result.data?.message).toContain('workout going');
    });

    it('should create workout context in conversation', async () => {
      await aiService.handleWorkoutSession('507f1f77bcf86cd799439011', 'session123');

      const conversations = await schemas.getConversationsCollection().find({}).toArray();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].context.currentActivity).toBe('workout');
      expect(conversations[0].context.sessionData?.sessionId).toBe('session123');
    });

    it('should handle user not found in workout session', async () => {
      mockUserService.getUserById.mockResolvedValue({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });

      const result = await aiService.handleWorkoutSession('invalid-id', 'session123');

      expect(result.success).toBe(false);
    });
  });

  describe('analyzeImage', () => {
    beforeEach(() => {
      mockOpenRouterClient.analyzeImage.mockResolvedValue({
        id: 'test',
        object: 'chat.completion',
        created: 123,
        model: 'test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I can see rice and chicken, approximately 450 calories total.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      });
    });

    it('should analyze food image successfully', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      
      const result = await aiService.analyzeImage(
        '507f1f77bcf86cd799439011',
        imageBuffer,
        'food_analysis'
      );

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain('rice and chicken');
      expect(result.data?.confidence).toBeDefined();
    });

    it('should handle image analysis errors', async () => {
      mockOpenRouterClient.analyzeImage.mockRejectedValue(
        new Error('Image analysis failed')
      );

      const imageBuffer = Buffer.from('fake-image-data');
      
      const result = await aiService.analyzeImage(
        '507f1f77bcf86cd799439011',
        imageBuffer
      );

      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('trouble analyzing');
    });
  });

  describe('getConversationHistory', () => {
    beforeEach(async () => {
      // Create a conversation with some messages
      const conversation = {
        userId: '507f1f77bcf86cd799439011',
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
          { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
          { role: 'user', content: 'How are you?', timestamp: new Date() },
          { role: 'assistant', content: 'I\'m great!', timestamp: new Date() },
        ],
        context: { lastInteraction: new Date() },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await schemas.getConversationsCollection().insertOne(conversation as any);
    });

    it('should retrieve conversation history', async () => {
      const result = await aiService.getConversationHistory('507f1f77bcf86cd799439011');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4);
      expect(result.data?.[0].content).toBe('Hello');
      expect(result.metadata?.totalMessages).toBe(4);
    });

    it('should limit conversation history', async () => {
      const result = await aiService.getConversationHistory('507f1f77bcf86cd799439011', 2);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].content).toBe('How are you?'); // Last 2 messages
    });

    it('should return empty array for non-existent user', async () => {
      const result = await aiService.getConversationHistory('507f1f77bcf86cd799439012');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle invalid user ID format', async () => {
      const result = await aiService.getConversationHistory('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
    });
  });
});