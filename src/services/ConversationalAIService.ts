import { ObjectId } from 'mongodb';
import { database } from '../database/connection';
import { OpenRouterClient } from './OpenRouterClient';
import { UserService } from './UserService';
import { 
  Conversation, 
  Message, 
  ConversationContext, 
  User, 
  ApiResponse 
} from '../types';
import { createError } from '../middleware/errorHandler';
import { config } from '../config';

export interface AIResponse {
  message: string;
  context?: ConversationContext;
  suggestions?: string[];
  metadata?: any;
}

export interface OnboardingFlow {
  step: string;
  message: string;
  expectedInput: string;
  nextStep?: string;
}

export interface WorkoutSessionResponse {
  message: string;
  sessionActive: boolean;
  exerciseLogged?: boolean;
  sessionComplete?: boolean;
}

export interface ImageAnalysisResponse {
  message: string;
  detectedItems?: any[];
  totalCalories?: number;
  confidence?: number;
}

export class ConversationalAIService {
  private openRouterClient: OpenRouterClient;
  private userService: UserService;

  constructor() {
    this.openRouterClient = new OpenRouterClient();
    this.userService = new UserService();
  }

  private get conversationsCollection() {
    return database.getSchemas().getConversationsCollection();
  }

  /**
   * Process a message from a user and generate an AI response
   */
  async processMessage(
    userId: string,
    message: string,
    context?: ConversationContext
  ): Promise<ApiResponse<AIResponse>> {
    try {
      // Get user profile for context - handle both ObjectId and telegramId
      let userResult;
      if (ObjectId.isValid(userId)) {
        userResult = await this.userService.getUserById(userId);
      } else {
        userResult = await this.userService.getUserByTelegramId(userId);
      }
      
      // If user doesn't exist and we have a telegramId, create a basic user profile
      if (!userResult.success || !userResult.data) {
        if (!ObjectId.isValid(userId)) {
          // Check if database is connected before trying to create user
          if (!database.isConnected()) {
            console.warn('⚠️  Database not connected, using temporary user context');
            // Create a temporary user object for AI context (won't be saved)
            const tempUser: User = {
              _id: new ObjectId(),
              telegramId: userId,
              profile: {
                name: 'User',
                age: 25,
                height: 170,
                weight: 70,
                bmi: 24.2,
                fitnessGoal: 'maintain',
                trainingPhilosophy: 'custom',
                experienceLevel: 'beginner',
              },
              schedule: {
                workDays: [],
                availableHours: [],
                preferredWorkoutDuration: 60,
                workoutDaysPerWeek: 3,
              },
              preferences: {
                reminderFrequency: 'daily',
                humorEnabled: true,
                conversationStyle: 'casual',
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            userResult = { success: true, data: tempUser };
          } else {
            // This is a telegramId, create a new user
            console.log(`Creating new user for telegramId: ${userId}`);
            const newUserResult = await this.userService.createUser({
              telegramId: userId,
              profile: {
                name: 'User', // Will be updated during onboarding
                age: 25, // Default, will be updated
                height: 170, // Default, will be updated
                weight: 70, // Default, will be updated
                bmi: 24.2, // Default, will be recalculated
                fitnessGoal: 'maintain' as const,
                trainingPhilosophy: 'custom' as const,
                experienceLevel: 'beginner' as const,
              },
            });
            
            if (newUserResult.success && newUserResult.data) {
              userResult = newUserResult;
            } else {
              console.error('Failed to create new user:', newUserResult.error);
              throw createError('Failed to create user profile', 500);
            }
          }
        } else {
          throw createError('User not found', 404);
        }
      }

      const user = userResult.data;
      if (!user || !user._id) {
        throw createError('User ID is missing', 500);
      }
      const actualUserId = user._id.toString();
      
      // Get or create conversation using the actual user ObjectId (only if DB is connected)
      let conversation: Conversation | null = null;
      if (database.isConnected()) {
        conversation = await this.getOrCreateConversation(actualUserId, context);
      } else {
        // Create in-memory conversation if DB not connected
        conversation = {
          userId: user._id,
          messages: [],
          context: context || {
            currentActivity: undefined,
            sessionData: {},
            lastInteraction: new Date(),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      
      // Add user message to conversation
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      conversation.messages.push(userMessage);

      // Detect intent and update context
      const updatedContext = await this.updateContextFromMessage(message, conversation.context, user);
      conversation.context = updatedContext;

      // Generate AI response
      const aiResponseText = await this.openRouterClient.generateResponse(message, {
        conversationHistory: conversation.messages.slice(-10).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        userProfile: user.profile,
        currentActivity: updatedContext.currentActivity,
      });

      // Add AI response to conversation
      const aiMessage: Message = {
        role: 'assistant',
        content: aiResponseText,
        timestamp: new Date(),
      };
      conversation.messages.push(aiMessage);

      // Update conversation in database (only if connected)
      if (database.isConnected()) {
        await this.saveConversation(conversation);
      }

      // Generate suggestions based on context
      const suggestions = this.generateSuggestions(updatedContext, user);

      return {
        success: true,
        data: {
          message: aiResponseText,
          context: updatedContext,
          suggestions,
          metadata: {
            conversationId: conversation._id,
            messageCount: conversation.messages.length,
            currentActivity: updatedContext.currentActivity,
          },
        },
      };
    } catch (error: any) {
      console.error('Error processing message:', error);
      console.error('Error details:', {
        code: error.name || error.code,
        message: error.message,
        stack: error.stack,
      });
      
      // Provide more specific error messages
      let userMessage = 'I\'m having trouble understanding right now. Could you try rephrasing that?';
      
      if (error.message?.includes('User not found') || error.message?.includes('User ID is missing')) {
        userMessage = 'I need to set up your profile first. Please send /start to begin!';
      } else if (error.message?.includes('OpenRouter') || error.message?.includes('AI service')) {
        userMessage = 'I\'m having trouble connecting to my AI service. Please try again in a moment!';
      } else if (error.message?.includes('Database') || error.message?.includes('MongoDB')) {
        userMessage = 'I\'m having database issues. Please try again in a moment!';
      }
      
      return {
        success: false,
        error: {
          code: error.name || 'MESSAGE_PROCESSING_ERROR',
          message: error.message,
          userMessage,
        },
      };
    }
  }

  /**
   * Start the onboarding process for a new user
   */
  async startOnboarding(userId: string): Promise<ApiResponse<OnboardingFlow>> {
    try {
      // Get or resolve user ID - handle both ObjectId and telegramId
      let actualUserId = userId;
      if (!ObjectId.isValid(userId)) {
        const userResult = await this.userService.getUserByTelegramId(userId);
        if (userResult.success && userResult.data && userResult.data._id) {
          actualUserId = userResult.data._id.toString();
        }
      }

      const onboardingMessage = await this.openRouterClient.generateResponse(
        'Start onboarding for a new user',
        {
          systemPrompt: `You are starting the onboarding process for Fit Buddy. 
          
          Your goal is to:
          1. Welcome the user warmly
          2. Explain what Fit Buddy can do
          3. Ask for their name to start personalizing the experience
          
          Be conversational, friendly, and exciting about helping them on their fitness journey.
          Keep it concise but engaging.`,
        }
      );

      const onboardingFlow: OnboardingFlow = {
        step: 'welcome',
        message: onboardingMessage,
        expectedInput: 'user_name',
        nextStep: 'basic_info',
      };

      // Create initial conversation with onboarding context
      await this.getOrCreateConversation(actualUserId, {
        currentActivity: 'onboarding',
        sessionData: { step: 'welcome' },
      });

      return {
        success: true,
        data: onboardingFlow,
      };
    } catch (error: any) {
      console.error('Error starting onboarding:', error);
      return {
        success: false,
        error: {
          code: 'ONBOARDING_ERROR',
          message: error.message,
          userMessage: 'Welcome to Fit Buddy! I\'m here to help you on your fitness journey. What\'s your name?',
        },
      };
    }
  }

  /**
   * Handle workout session interactions
   */
  async handleWorkoutSession(
    userId: string,
    sessionId: string
  ): Promise<ApiResponse<WorkoutSessionResponse>> {
    try {
      // Get user and conversation context - handle both ObjectId and telegramId
      let userResult;
      if (ObjectId.isValid(userId)) {
        userResult = await this.userService.getUserById(userId);
      } else {
        userResult = await this.userService.getUserByTelegramId(userId);
      }
      
      if (!userResult.success || !userResult.data || !userResult.data._id) {
        throw createError('User not found', 404);
      }

      const actualUserId = userResult.data._id.toString();
      await this.getOrCreateConversation(actualUserId, {
        currentActivity: 'workout',
        sessionData: { sessionId, startTime: new Date() },
      });

      const checkInMessage = await this.openRouterClient.generateResponse(
        'Check in with user during workout session',
        {
          systemPrompt: `You are checking in with a user during their workout session.
          
          Ask them conversationally about:
          - What exercise they just completed or are doing
          - How many sets and reps they did
          - How they're feeling
          
          Be encouraging and supportive. Keep it brief since they're working out.`,
          userProfile: userResult.data!.profile,
          currentActivity: 'workout',
        }
      );

      return {
        success: true,
        data: {
          message: checkInMessage,
          sessionActive: true,
          exerciseLogged: false,
          sessionComplete: false,
        },
      };
    } catch (error: any) {
      console.error('Error handling workout session:', error);
      return {
        success: false,
        error: {
          code: 'WORKOUT_SESSION_ERROR',
          message: error.message,
          userMessage: 'How\'s your workout going? Let me know what exercise you just finished!',
        },
      };
    }
  }

  /**
   * Analyze an image (for food recognition)
   */
  async analyzeImage(
    userId: string,
    imageData: Buffer,
    _context: string = 'food_analysis'
  ): Promise<ApiResponse<ImageAnalysisResponse>> {
    try {
      const imageBase64 = imageData.toString('base64');
      
      const analysisPrompt = `Analyze this food image for a Nigerian fitness app user. 
      
      Please identify:
      1. All food items visible
      2. Estimated portion sizes
      3. Approximate calories for each item
      4. Total estimated calories
      5. Any Nigerian/local food names if applicable
      
      Respond in a conversational way as if talking to the user directly.
      Be encouraging about their food tracking efforts.`;

      const response = await this.openRouterClient.analyzeImage(
        imageBase64,
        analysisPrompt
      );

      const analysisMessage = response.choices[0]?.message?.content || 
        'I can see your food, but I\'m having trouble analyzing it right now. Could you tell me what you\'re eating?';

      return {
        success: true,
        data: {
          message: analysisMessage,
          confidence: 0.8, // Placeholder - would be calculated based on AI confidence
        },
      };
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      return {
        success: false,
        error: {
          code: 'IMAGE_ANALYSIS_ERROR',
          message: error.message,
          userMessage: 'I\'m having trouble analyzing that image. Could you describe what you\'re eating instead?',
        },
      };
    }
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(
    userId: string,
    limit: number = 50
  ): Promise<ApiResponse<Message[]>> {
    try {
      // Resolve userId to actual ObjectId if it's a telegramId
      let actualUserId = userId;
      if (!ObjectId.isValid(userId)) {
        const userResult = await this.userService.getUserByTelegramId(userId);
        if (!userResult.success || !userResult.data || !userResult.data._id) {
          return {
            success: true,
            data: [],
          };
        }
        actualUserId = userResult.data._id.toString();
      }

      const conversation = await this.conversationsCollection.findOne(
        { userId: new ObjectId(actualUserId) },
        { sort: { updatedAt: -1 } }
      );

      if (!conversation) {
        return {
          success: true,
          data: [],
        };
      }

      const messages = conversation.messages.slice(-limit);

      return {
        success: true,
        data: messages,
        metadata: {
          totalMessages: conversation.messages.length,
          conversationId: conversation._id,
          lastActivity: conversation.context.lastInteraction,
        },
      };
    } catch (error: any) {
      console.error('Error getting conversation history:', error);
      return {
        success: false,
        error: {
          code: 'CONVERSATION_HISTORY_ERROR',
          message: error.message,
          userMessage: 'Unable to retrieve conversation history.',
        },
      };
    }
  }

  // Private helper methods

  private async getOrCreateConversation(
    userId: string,
    context?: ConversationContext
  ): Promise<Conversation> {
    if (!ObjectId.isValid(userId)) {
      throw createError('Invalid user ID format', 400);
    }

    const userObjectId = new ObjectId(userId);
    
    // Try to get existing conversation
    let conversation = await this.conversationsCollection.findOne(
      { userId: userObjectId },
      { sort: { updatedAt: -1 } }
    );

    if (!conversation) {
      // Create new conversation
      const newConversation: Conversation = {
        userId: userObjectId,
        messages: [],
        context: context || {
          currentActivity: undefined,
          sessionData: {},
          lastInteraction: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.conversationsCollection.insertOne(newConversation);
      conversation = { ...newConversation, _id: result.insertedId };
    }

    return conversation;
  }

  private async saveConversation(conversation: Conversation): Promise<void> {
    conversation.updatedAt = new Date();
    conversation.context.lastInteraction = new Date();

    await this.conversationsCollection.updateOne(
      { _id: conversation._id },
      { $set: conversation },
      { upsert: true }
    );
  }

  private async updateContextFromMessage(
    message: string,
    currentContext: ConversationContext,
    user: User
  ): Promise<ConversationContext> {
    const lowerMessage = message.toLowerCase();
    
    // Simple intent detection
    let newActivity = currentContext.currentActivity;
    
    if (lowerMessage.includes('gym') || lowerMessage.includes('workout') || lowerMessage.includes('exercise')) {
      newActivity = 'workout';
    } else if (lowerMessage.includes('food') || lowerMessage.includes('eat') || lowerMessage.includes('meal')) {
      newActivity = 'meal_planning';
    } else if (lowerMessage.includes('gym') && (lowerMessage.includes('find') || lowerMessage.includes('location'))) {
      newActivity = 'gym_search';
    }

    return {
      ...currentContext,
      currentActivity: newActivity,
      userPreferences: user.preferences,
      lastInteraction: new Date(),
    };
  }

  private generateSuggestions(context: ConversationContext, _user: User): string[] {
    const suggestions: string[] = [];

    switch (context.currentActivity) {
      case 'onboarding':
        suggestions.push('Tell me about your fitness goals');
        suggestions.push('What\'s your workout experience?');
        suggestions.push('Help me plan my schedule');
        break;
      
      case 'workout':
        suggestions.push('I\'m at the gym');
        suggestions.push('Log my workout');
        suggestions.push('What exercise should I do next?');
        break;
      
      case 'meal_planning':
        suggestions.push('Plan my meals for today');
        suggestions.push('Analyze this food photo');
        suggestions.push('What should I eat for breakfast?');
        break;
      
      case 'gym_search':
        suggestions.push('Find gyms near me');
        suggestions.push('Show me standard quality gyms');
        suggestions.push('Add a new gym location');
        break;
      
      default:
        suggestions.push('Plan my workout');
        suggestions.push('Help with nutrition');
        suggestions.push('Find a gym');
        suggestions.push('Track my progress');
    }

    return suggestions;
  }
}