import { config } from '../config';
import { createError } from '../middleware/errorHandler';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: OpenRouterMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.openRouter.apiKey;
    this.baseUrl = config.openRouter.baseUrl;
  }

  /**
   * Send a chat completion request to OpenRouter
   */
  async chat(
    messages: OpenRouterMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<OpenRouterResponse> {
    try {
      const {
        model = 'anthropic/claude-3.5-sonnet',
        temperature = 0.7,
        maxTokens = 1000,
        stream = false,
      } = options;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fitbuddy.app',
          'X-Title': 'Fit Buddy - AI Fitness Companion',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as OpenRouterError;
        throw createError(
          `OpenRouter API error: ${errorData.error.message}`,
          response.status
        );
      }

      const data = await response.json() as OpenRouterResponse;
      return data;
    } catch (error: any) {
      console.error('OpenRouter API error:', error);
      
      if (error.statusCode) {
        throw error; // Re-throw our custom errors
      }
      
      throw createError(
        `Failed to communicate with AI service: ${error.message}`,
        500
      );
    }
  }

  /**
   * Analyze an image using OpenRouter vision models
   */
  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<OpenRouterResponse> {
    try {
      const {
        model = 'anthropic/claude-3.5-sonnet',
        temperature = 0.3,
        maxTokens = 1000,
      } = options;

      const messages: OpenRouterMessage[] = [
        {
          role: 'user',
          content: `${prompt}

Image data: data:image/jpeg;base64,${imageBase64}`,
        },
      ];

      return await this.chat(messages, { model, temperature, maxTokens });
    } catch (error: any) {
      console.error('Image analysis error:', error);
      throw createError(
        `Failed to analyze image: ${error.message}`,
        500
      );
    }
  }

  /**
   * Generate a conversational response with context
   */
  async generateResponse(
    userMessage: string,
    context: {
      systemPrompt?: string;
      conversationHistory?: OpenRouterMessage[];
      userProfile?: any;
      currentActivity?: string;
    } = {}
  ): Promise<string> {
    try {
      const {
        systemPrompt = this.getDefaultSystemPrompt(),
        conversationHistory = [],
        userProfile,
        currentActivity,
      } = context;

      // Build messages array
      const messages: OpenRouterMessage[] = [
        { role: 'system', content: this.buildSystemPrompt(systemPrompt, userProfile, currentActivity) },
        ...conversationHistory.slice(-10), // Keep last 10 messages for context
        { role: 'user', content: userMessage },
      ];

      const response = await this.chat(messages, {
        temperature: 0.8, // Higher temperature for more conversational responses
        maxTokens: 500,
      });

      return response.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response. Please try again.';
    } catch (error: any) {
      console.error('Response generation error:', error);
      
      // Provide fallback responses for different error types
      if (error.statusCode === 429) {
        return 'I need a moment to think. Please try again in a few seconds! 🤔';
      }
      
      return 'I\'m having trouble connecting right now. Let me try to help you in a different way!';
    }
  }

  /**
   * Get default system prompt for Fit Buddy
   */
  private getDefaultSystemPrompt(): string {
    return `You are Fit Buddy, a friendly and knowledgeable AI fitness companion designed specifically for Nigerian users. Your personality is:

- Conversational and natural (never robotic or scripted)
- Supportive and motivational without being pushy
- Knowledgeable about fitness, nutrition, and Nigerian culture
- Able to use humor when appropriate (if user has humor enabled)
- Focused on helping users achieve their fitness goals

Key behaviors:
- Always respond in a conversational, human-like manner
- Ask follow-up questions to gather information naturally
- Provide specific, actionable advice
- Reference Nigerian foods, culture, and context when relevant
- Adapt your communication style to the user's preferences
- Be encouraging but realistic about fitness goals

Remember: You're not just answering questions, you're having a conversation with someone who wants to improve their fitness journey.`;
  }

  /**
   * Build enhanced system prompt with user context
   */
  private buildSystemPrompt(basePrompt: string, userProfile?: any, currentActivity?: string): string {
    let enhancedPrompt = basePrompt;

    if (userProfile) {
      enhancedPrompt += `\n\nUser Profile Context:
- Name: ${userProfile.name || 'User'}
- Fitness Goal: ${userProfile.fitnessGoal || 'Not set'}
- Training Philosophy: ${userProfile.trainingPhilosophy || 'Not set'}
- Experience Level: ${userProfile.experienceLevel || 'Not set'}
- BMI Category: ${this.getBMICategory(userProfile.bmi)}
- Conversation Style: ${userProfile.conversationStyle || 'casual'}
- Humor Enabled: ${userProfile.humorEnabled ? 'Yes' : 'No'}`;
    }

    if (currentActivity) {
      enhancedPrompt += `\n\nCurrent Activity: ${currentActivity}
Adjust your responses to be relevant to this activity.`;
    }

    return enhancedPrompt;
  }

  /**
   * Helper method to get BMI category
   */
  private getBMICategory(bmi?: number): string {
    if (!bmi) return 'Unknown';
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal weight';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
  }

  /**
   * Test the connection to OpenRouter
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: 'user', content: 'Hello, please respond with just "OK" to test the connection.' }
      ], {
        maxTokens: 10,
        temperature: 0,
      });

      return response.choices[0]?.message?.content?.includes('OK') || false;
    } catch (error) {
      console.error('OpenRouter connection test failed:', error);
      return false;
    }
  }
}