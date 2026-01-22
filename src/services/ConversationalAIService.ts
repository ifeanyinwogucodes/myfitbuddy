import { ObjectId } from 'mongodb';
import { database } from '../database/connection';
import { OpenRouterClient } from './OpenRouterClient';
import { UserService } from './UserService';
import { OnboardingService, OnboardingState } from './OnboardingService';
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
  private onboardingService: OnboardingService;

  constructor() {
    this.openRouterClient = new OpenRouterClient();
    this.userService = new UserService();
    this.onboardingService = new OnboardingService();
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
      // Check if user is in onboarding mode
      const onboardingState = context?.sessionData?.onboardingState as OnboardingState | undefined;
      if (onboardingState && onboardingState.step !== 'complete') {
        // User is in onboarding, process through onboarding service
        const onboardingResult = await this.onboardingService.processOnboardingStep(
          userId,
          onboardingState.step,
          message,
          onboardingState
        );

        // Update context with new onboarding state
        const updatedContext: ConversationContext = {
          ...context,
          currentActivity: 'onboarding',
          sessionData: {
            ...context?.sessionData,
            onboardingState: onboardingResult.state,
          },
          lastInteraction: new Date(),
        };

        return {
          success: onboardingResult.success,
          data: {
            message: onboardingResult.message,
            context: updatedContext,
            suggestions: onboardingResult.nextStep ? [] : undefined,
            metadata: {
              onboardingStep: onboardingResult.nextStep || onboardingResult.state.step,
              userCreated: onboardingResult.userCreated,
            },
          },
        };
      }

      // Get user profile for context - handle both ObjectId and telegramId
      let userResult;
      if (ObjectId.isValid(userId)) {
        userResult = await this.userService.getUserById(userId);
      } else {
        userResult = await this.userService.getUserByTelegramId(userId);
      }
      
      // If user doesn't exist and we have a telegramId, start onboarding
      if (!userResult.success || !userResult.data) {
        if (!ObjectId.isValid(userId)) {
          // Start onboarding process
          const initialMessage = this.onboardingService.getInitialMessage();
          const onboardingState: OnboardingState = {
            step: 'name',
            data: {},
          };

          const updatedContext: ConversationContext = {
            currentActivity: 'onboarding',
            sessionData: {
              onboardingState,
            },
            lastInteraction: new Date(),
          };

          return {
            success: true,
            data: {
              message: initialMessage,
              context: updatedContext,
              metadata: {
                onboardingStep: 'name',
              },
            },
          };
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
        // Restore onboarding state from conversation if available
        if (conversation.context.sessionData?.onboardingState && !context?.sessionData?.onboardingState) {
          context = {
            ...context,
            sessionData: {
              ...context?.sessionData,
              onboardingState: conversation.context.sessionData.onboardingState,
            },
          };
        }
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

      // Check if user is in workout mode or starting a workout
      const lowerMessage = message.toLowerCase();
      const isWorkoutActivity = conversation.context.currentActivity === 'workout';
      const isStartingWorkout = lowerMessage.includes('at the gym') || lowerMessage.includes("i'm at the gym") || 
                                (lowerMessage.includes('gym') && !isWorkoutActivity);
      
      if (isStartingWorkout || isWorkoutActivity) {
        const sessionId = conversation.context.sessionData?.sessionId || `session_${Date.now()}`;
        const workoutResponse = await this.handleWorkoutSession(actualUserId, sessionId, message);
        if (workoutResponse.success) {
          // Update conversation context with workout session
          conversation.context = {
            ...conversation.context,
            currentActivity: 'workout',
            sessionData: {
              ...conversation.context.sessionData,
              sessionId,
              exercisesLogged: workoutResponse.data?.exerciseLogged ? 
                [...(conversation.context.sessionData?.exercisesLogged || []), workoutResponse.data] : 
                conversation.context.sessionData?.exercisesLogged || [],
            },
            lastInteraction: new Date(),
          };
          if (database.isConnected()) {
            await this.saveConversation(conversation);
          }
          
          return {
            success: true,
            data: {
              message: workoutResponse.data!.message,
              context: conversation.context,
              metadata: {
                workoutSessionActive: true,
                exerciseLogged: workoutResponse.data?.exerciseLogged,
              },
            },
          };
        }
      }
      
      // Check for schedule change confirmation first
      const scheduleChangeState = conversation.context.sessionData?.scheduleChangeConfirmation;
      if (scheduleChangeState && scheduleChangeState.pending) {
        const confirmed = this.parseYesNo(message);
        if (confirmed !== null) {
          if (confirmed) {
            // User confirmed, update schedule
            const newTimeSlots = this.parseGymTimeToTimeSlots(scheduleChangeState.newTime);
            const updateResult = await this.userService.updateUserSchedule(actualUserId, {
              availableHours: newTimeSlots,
            });
            
            if (updateResult.success) {
              // Clear the confirmation state
              conversation.context.sessionData = {
                ...conversation.context.sessionData,
                scheduleChangeConfirmation: undefined,
              };
              await this.saveConversation(conversation);
              
              return {
                success: true,
                data: {
                  message: `Perfect! I've updated your gym time to ${scheduleChangeState.newTime}. I'll make sure to check in with you at that time! 💪`,
                  context: conversation.context,
                },
              };
            } else {
              return {
                success: false,
                error: {
                  code: 'SCHEDULE_UPDATE_ERROR',
                  message: 'Failed to update schedule',
                  userMessage: 'I had trouble updating your schedule. Let me try again - what time do you go to the gym?',
                },
              };
            }
          } else {
            // User declined, keep previous schedule
            conversation.context.sessionData = {
              ...conversation.context.sessionData,
              scheduleChangeConfirmation: undefined,
            };
            await this.saveConversation(conversation);
            
            const previousTime = this.formatTimeSlots(user.schedule.availableHours);
            return {
              success: true,
              data: {
                message: `No problem! I'll keep your previous gym time (${previousTime}). Let me know if anything changes! 👍`,
                context: conversation.context,
              },
            };
          }
        } else {
          // User didn't give clear yes/no, ask again
          return {
            success: true,
            data: {
              message: `I noticed you mentioned a new gym time (${scheduleChangeState.newTime}), but your current time is ${this.formatTimeSlots(user.schedule.availableHours)}. Do you want to update your schedule? Please say "yes" to update or "no" to keep your current time.`,
              context: conversation.context,
            },
          };
        }
      }

      // Detect schedule changes in user message
      const detectedTime = this.detectGymTimeChange(message, user.schedule.availableHours);
      if (detectedTime && detectedTime !== this.formatTimeSlots(user.schedule.availableHours)) {
        // Store the change in conversation context for confirmation
        conversation.context.sessionData = {
          ...conversation.context.sessionData,
          scheduleChangeConfirmation: {
            pending: true,
            newTime: detectedTime,
            previousTime: this.formatTimeSlots(user.schedule.availableHours),
          },
        };
        await this.saveConversation(conversation);
        
        return {
          success: true,
          data: {
            message: `I noticed you mentioned a new gym time (${detectedTime}), but your current schedule shows ${this.formatTimeSlots(user.schedule.availableHours)}. Do you want to update your schedule to ${detectedTime}, or would you like to keep your previous time? Please say "yes" to update or "no" to maintain your current schedule.`,
            context: conversation.context,
          },
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
      const initialMessage = this.onboardingService.getInitialMessage();
      const onboardingState: OnboardingState = {
        step: 'name',
        data: {},
      };

      const onboardingFlow: OnboardingFlow = {
        step: 'name',
        message: initialMessage,
        expectedInput: 'user_name',
        nextStep: 'has_timetable',
      };

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
    sessionId: string,
    userMessage?: string
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
      const conversation = await this.getOrCreateConversation(actualUserId, {
        currentActivity: 'workout',
        sessionData: { 
          sessionId, 
          startTime: new Date(),
          currentExercise: null,
          exercisesLogged: [],
        },
      });

      // Check if user is confirming they're at the gym
      if (userMessage && (userMessage.toLowerCase().includes('at the gym') || userMessage.toLowerCase().includes('gym'))) {
        const welcomeMessage = await this.openRouterClient.generateResponse(
          'User just confirmed they are at the gym. Welcome them and ask what exercise they are starting with or just finished.',
          {
            systemPrompt: `You are a supportive fitness partner. The user just told you they're at the gym. 
            
            Be enthusiastic and ask:
            - What exercise are they starting with or just finished?
            - Once they tell you, you'll ask for sets and reps
            
            Keep it brief and motivating.`,
            userProfile: userResult.data!.profile,
            currentActivity: 'workout',
          }
        );

        return {
          success: true,
          data: {
            message: welcomeMessage,
            sessionActive: true,
            exerciseLogged: false,
            sessionComplete: false,
          },
        };
      }

      // If user provided exercise info, extract and ask for sets/reps
      const exerciseInfo = this.extractExerciseInfo(userMessage || '');
      if (exerciseInfo.exercise) {
        // Update conversation context with current exercise
        conversation.context.sessionData = {
          ...conversation.context.sessionData,
          currentExercise: exerciseInfo.exercise,
        };
        await this.saveConversation(conversation);

        if (!exerciseInfo.sets || !exerciseInfo.reps) {
          // Ask for sets and reps
          const askForSetsReps = await this.openRouterClient.generateResponse(
            `User just told you they did ${exerciseInfo.exercise}. Ask them how many sets and reps they did.`,
            {
              systemPrompt: `The user just completed or is doing: ${exerciseInfo.exercise}
              
              Ask them conversationally:
              - How many sets did they do?
              - How many reps per set?
              - What weight did they use? (optional)
              
              Be encouraging and brief.`,
              userProfile: userResult.data!.profile,
              currentActivity: 'workout',
            }
          );

          return {
            success: true,
            data: {
              message: askForSetsReps,
              sessionActive: true,
              exerciseLogged: false,
              sessionComplete: false,
            },
          };
        } else {
          // Log the exercise with sets and reps
          conversation.context.sessionData.exercisesLogged = [
            ...(conversation.context.sessionData.exercisesLogged || []),
            {
              exercise: exerciseInfo.exercise,
              sets: exerciseInfo.sets,
              reps: exerciseInfo.reps,
              weight: exerciseInfo.weight,
            },
          ];
          conversation.context.sessionData.currentExercise = null;
          await this.saveConversation(conversation);

          const confirmMessage = await this.openRouterClient.generateResponse(
            `User just logged: ${exerciseInfo.exercise} - ${exerciseInfo.sets} sets x ${exerciseInfo.reps} reps${exerciseInfo.weight ? ` @ ${exerciseInfo.weight}kg` : ''}. Acknowledge and ask what exercise they're doing next.`,
            {
              systemPrompt: `The user just logged their exercise. Acknowledge it briefly and ask what they're doing next.
              
              Keep it short and motivating.`,
              userProfile: userResult.data!.profile,
              currentActivity: 'workout',
            }
          );

          return {
            success: true,
            data: {
              message: confirmMessage,
              sessionActive: true,
              exerciseLogged: true,
              sessionComplete: false,
            },
          };
        }
      }

      // Default check-in message
      const checkInMessage = await this.openRouterClient.generateResponse(
        'Check in with user during workout session. Ask what exercise they just completed or are doing.',
        {
          systemPrompt: `You are checking in with a user during their workout session.
          
          Ask them conversationally about:
          - What exercise they just completed or are doing
          - Once they tell you, ask for sets and reps
          
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
   * Extract exercise information from user message
   */
  private extractExerciseInfo(message: string): {
    exercise?: string;
    sets?: number;
    reps?: number;
    weight?: number;
  } {
    const lower = message.toLowerCase();
    const result: any = {};

    // Try to extract sets and reps patterns
    // e.g., "3 sets of 10 reps", "3x10", "3 sets x 10 reps"
    const setsRepsPattern = /(\d+)\s*(?:sets?|x)\s*(?:of\s*)?(\d+)\s*(?:reps?|repetitions?)/i;
    const setsRepsMatch = message.match(setsRepsPattern);
    if (setsRepsMatch) {
      result.sets = parseInt(setsRepsMatch[1]);
      result.reps = parseInt(setsRepsMatch[2]);
    }

    // Try to extract weight
    const weightPattern = /(\d+(?:\.\d+)?)\s*(?:kg|kilos?|lbs?|pounds?)/i;
    const weightMatch = message.match(weightPattern);
    if (weightMatch) {
      let weight = parseFloat(weightMatch[1]);
      if (lower.includes('lb') || lower.includes('pound')) {
        weight = weight * 0.453592; // Convert to kg
      }
      result.weight = Math.round(weight);
    }

    // Extract exercise name (everything before sets/reps/weight info)
    let exerciseText = message;
    if (setsRepsMatch) {
      exerciseText = message.substring(0, setsRepsMatch.index).trim();
    }
    if (weightMatch && (!setsRepsMatch || (weightMatch.index && weightMatch.index < setsRepsMatch.index!))) {
      exerciseText = message.substring(0, weightMatch.index).trim();
    }

    // Common exercise names
    const exerciseKeywords = [
      'bench press', 'squat', 'deadlift', 'bicep curl', 'tricep extension',
      'shoulder press', 'lat pulldown', 'row', 'pull up', 'push up',
      'leg press', 'leg curl', 'leg extension', 'chest press', 'fly',
    ];

    for (const keyword of exerciseKeywords) {
      if (lower.includes(keyword)) {
        result.exercise = keyword;
        break;
      }
    }

    // If no keyword found, use the text before numbers as exercise name
    if (!result.exercise && exerciseText) {
      result.exercise = exerciseText.split(/\d/)[0].trim() || exerciseText;
    }

    return result;
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

  /**
   * Detect gym time changes in user message
   */
  private detectGymTimeChange(message: string, currentTimeSlots: Array<{ start: string; end: string }>): string | null {
    const lower = message.toLowerCase();
    
    // Check if message mentions time-related keywords
    const timeKeywords = [
      'gym time', 'workout time', 'go to gym', 'gym at', 'workout at',
      'now i go', 'i go', 'my time', 'schedule', 'changed', 'new time'
    ];
    
    const hasTimeKeyword = timeKeywords.some(keyword => lower.includes(keyword));
    if (!hasTimeKeyword) {
      return null;
    }

    // Extract time from message
    const extractedTime = this.extractTimeFromMessage(message);
    if (!extractedTime) {
      return null;
    }

    // Compare with current time
    const currentTimeFormatted = this.formatTimeSlots(currentTimeSlots);
    if (extractedTime.toLowerCase() === currentTimeFormatted.toLowerCase()) {
      return null; // Same time, no change
    }

    return extractedTime;
  }

  /**
   * Parse gym time string to TimeSlot array
   */
  private parseGymTimeToTimeSlots(timeStr: string): Array<{ start: string; end: string }> {
    const lower = timeStr.toLowerCase();
    
    if (lower.includes('morning') || lower.includes('am')) {
      return [{ start: '06:00', end: '10:00' }];
    }
    if (lower.includes('afternoon')) {
      return [{ start: '12:00', end: '16:00' }];
    }
    if (lower.includes('evening') || lower.includes('night') || lower.includes('pm')) {
      return [{ start: '17:00', end: '21:00' }];
    }
    if (lower.includes('after work')) {
      return [{ start: '17:00', end: '20:00' }];
    }
    
    // Try to extract specific time (e.g., "6 AM", "7 PM")
    const timePattern = /(\d{1,2})\s*(am|pm|:?\d{2})?/i;
    const match = lower.match(timePattern);
    if (match) {
      let hour = parseInt(match[1]);
      const isPM = lower.includes('pm') || (hour < 12 && (lower.includes('evening') || lower.includes('night')));
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endTime = `${(hour + 2).toString().padStart(2, '0')}:00`;
      return [{ start: startTime, end: endTime }];
    }
    
    // Default to evening if can't parse
    return [{ start: '18:00', end: '20:00' }];
  }

  /**
   * Format TimeSlot array to readable string
   */
  private formatTimeSlots(timeSlots: Array<{ start: string; end: string }>): string {
    if (!timeSlots || timeSlots.length === 0) {
      return 'not set';
    }
    
    const slot = timeSlots[0];
    const startHour = parseInt(slot.start.split(':')[0]);
    const endHour = parseInt(slot.end.split(':')[0]);
    
    const formatHour = (hour: number) => {
      if (hour === 0) return '12 AM';
      if (hour < 12) return `${hour} AM`;
      if (hour === 12) return '12 PM';
      return `${hour - 12} PM`;
    };
    
    return `${formatHour(startHour)} - ${formatHour(endHour)}`;
  }

  /**
   * Extract time from message (similar to OnboardingService.extractTime)
   */
  private extractTimeFromMessage(input: string): string | null {
    const cleaned = input.trim().toLowerCase();
    if (cleaned.length === 0) return null;
    
    // Try to extract time patterns
    const timePattern = /(\d{1,2})\s*(am|pm|:?\d{2})?/i;
    const match = cleaned.match(timePattern);
    if (match) {
      return input.trim(); // Return original for flexibility
    }
    
    // Accept common time descriptions
    if (['morning', 'afternoon', 'evening', 'night', 'after work', 'before work'].some(t => cleaned.includes(t))) {
      return input.trim();
    }
    
    return input.trim(); // Accept any input as time for now
  }

  /**
   * Parse yes/no response
   */
  private parseYesNo(input: string): boolean | null {
    const lower = input.toLowerCase().trim();
    if (['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'right', 'true', 'update', 'change'].includes(lower)) {
      return true;
    }
    if (['no', 'n', 'nope', 'nah', 'wrong', 'incorrect', 'false', 'keep', 'maintain', 'previous'].includes(lower)) {
      return false;
    }
    return null;
  }
}