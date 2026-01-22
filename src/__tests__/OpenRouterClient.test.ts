import { OpenRouterClient, OpenRouterMessage } from '../services/OpenRouterClient';

// Mock fetch globally
global.fetch = jest.fn();

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    client = new OpenRouterClient();
    mockFetch.mockClear();
  });

  describe('chat', () => {
    const mockResponse = {
      id: 'test-id',
      object: 'chat.completion',
      created: 1234567890,
      model: 'anthropic/claude-3.5-sonnet',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Hello! How can I help you with your fitness journey today?',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };

    it('should send a chat request successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const messages: OpenRouterMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await client.chat(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer'),
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"messages"'),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors gracefully', async () => {
      const errorResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => errorResponse,
      } as Response);

      const messages: OpenRouterMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      await expect(client.chat(messages)).rejects.toThrow('OpenRouter API error: Rate limit exceeded');
    });

    it('should use custom options when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const messages: OpenRouterMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      await client.chat(messages, {
        model: 'custom-model',
        temperature: 0.5,
        maxTokens: 200,
      });

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);

      expect(requestBody.model).toBe('custom-model');
      expect(requestBody.temperature).toBe(0.5);
      expect(requestBody.max_tokens).toBe(200);
    });
  });

  describe('generateResponse', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Great to meet you! Let\'s start your fitness journey.',
              },
            },
          ],
        }),
      } as Response);
    });

    it('should generate a conversational response', async () => {
      const response = await client.generateResponse('Hi, I\'m new here');

      expect(response).toBe('Great to meet you! Let\'s start your fitness journey.');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include user profile in system prompt', async () => {
      const userProfile = {
        name: 'John',
        fitnessGoal: 'bulk',
        experienceLevel: 'beginner',
        bmi: 22.5,
        conversationStyle: 'casual',
        humorEnabled: true,
      };

      await client.generateResponse('Hello', {
        userProfile,
        currentActivity: 'onboarding',
      });

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      const systemMessage = requestBody.messages[0];

      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('John');
      expect(systemMessage.content).toContain('bulk');
      expect(systemMessage.content).toContain('beginner');
      expect(systemMessage.content).toContain('onboarding');
    });

    it('should handle conversation history', async () => {
      const conversationHistory: OpenRouterMessage[] = [
        { role: 'user', content: 'What\'s my BMI?' },
        { role: 'assistant', content: 'Your BMI is 22.5, which is in the normal range.' },
      ];

      await client.generateResponse('Thanks!', {
        conversationHistory,
      });

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);

      expect(requestBody.messages).toHaveLength(4); // system + history + new message
      expect(requestBody.messages[1].content).toBe('What\'s my BMI?');
      expect(requestBody.messages[2].content).toBe('Your BMI is 22.5, which is in the normal range.');
      expect(requestBody.messages[3].content).toBe('Thanks!');
    });

    it('should provide fallback response on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await client.generateResponse('Hello');

      expect(response).toContain('having trouble connecting');
    });

    it('should handle rate limiting gracefully', async () => {
      const error = new Error('Rate limited');
      (error as any).statusCode = 429;
      mockFetch.mockRejectedValueOnce(error);

      const response = await client.generateResponse('Hello');

      expect(response).toContain('need a moment to think');
    });
  });

  describe('analyzeImage', () => {
    it('should analyze an image with proper prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'I can see rice and chicken in this image, approximately 400 calories total.',
              },
            },
          ],
        }),
      } as Response);

      const imageBase64 = 'base64-encoded-image-data';
      const result = await client.analyzeImage(imageBase64, 'Analyze this food');

      expect(mockFetch).toHaveBeenCalled();
      
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      
      expect(requestBody.messages[0].content).toContain('Analyze this food');
      expect(requestBody.messages[0].content).toContain('data:image/jpeg;base64,');
    });

    it('should handle image analysis errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Image processing failed'));

      await expect(
        client.analyzeImage('invalid-data', 'Analyze this')
      ).rejects.toThrow('Failed to analyze image');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'OK',
              },
            },
          ],
        }),
      } as Response);

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('should return false if response doesn\'t contain OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Hello there!',
              },
            },
          ],
        }),
      } as Response);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });
});