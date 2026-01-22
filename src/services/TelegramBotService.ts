import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { ConversationalAIService } from './ConversationalAIService';
import { UserService } from './UserService';
import { createError } from '../middleware/errorHandler';

export class TelegramBotService {
  private bot: TelegramBot;
  private aiService: ConversationalAIService;
  private userService: UserService;
  private isRunning: boolean = false;

  constructor() {
    // Disable polling by default to avoid conflicts
    // We'll start polling manually after checking for existing instances
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
    this.aiService = new ConversationalAIService();
    this.userService = new UserService();
  }

  /**
   * Start the Telegram bot
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        console.log('Telegram bot is already running');
        return;
      }

      // Set up webhook if in production, polling if in development
      if (config.server.nodeEnv === 'production' && config.telegram.webhookUrl) {
        // Delete any existing polling before setting webhook
        try {
          await this.bot.deleteWebHook();
        } catch (error) {
          // Ignore errors
        }
        await this.bot.setWebHook(config.telegram.webhookUrl);
        console.log(`🤖 Telegram bot webhook set to: ${config.telegram.webhookUrl}`);
      } else {
        // Use polling for development
        // First, delete any existing webhook to avoid conflicts
        try {
          await this.bot.deleteWebHook();
          console.log('🗑️  Deleted any existing webhooks');
        } catch (error: any) {
          // Ignore errors if webhook doesn't exist
          if (error.response?.error_code !== 404) {
            console.warn('Warning when deleting webhook:', error.message);
          }
        }
        
        // Wait a moment to ensure webhook deletion is processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Start polling
        this.bot.startPolling();
        console.log('🤖 Telegram bot started with polling');
      }

      this.setupMessageHandlers();
      this.isRunning = true;
      
      console.log('✅ Telegram bot is ready to receive messages');
    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
      throw error;
    }
  }

  /**
   * Stop the Telegram bot
   */
  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        return;
      }

      if (config.server.nodeEnv === 'production') {
        await this.bot.deleteWebHook();
      } else {
        this.bot.stopPolling();
      }

      this.isRunning = false;
      console.log('🛑 Telegram bot stopped');
    } catch (error) {
      console.error('Error stopping Telegram bot:', error);
    }
  }

  /**
   * Process webhook updates (for production)
   */
  async processWebhookUpdate(update: any): Promise<void> {
    try {
      this.bot.processUpdate(update);
    } catch (error) {
      console.error('Error processing webhook update:', error);
    }
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    // Handle /start command
    this.bot.onText(/\/start/, async (msg) => {
      await this.handleStartCommand(msg);
    });

    // Handle /help command
    this.bot.onText(/\/help/, async (msg) => {
      await this.handleHelpCommand(msg);
    });

    // Handle /profile command
    this.bot.onText(/\/profile/, async (msg) => {
      await this.handleProfileCommand(msg);
    });

    // Handle /workout command
    this.bot.onText(/\/workout/, async (msg) => {
      await this.handleWorkoutCommand(msg);
    });

    // Handle /nutrition command
    this.bot.onText(/\/nutrition/, async (msg) => {
      await this.handleNutritionCommand(msg);
    });

    // Handle photo messages (for food analysis)
    this.bot.on('photo', async (msg) => {
      await this.handlePhotoMessage(msg);
    });

    // Handle all other text messages
    this.bot.on('message', async (msg) => {
      // Skip if it's a command or photo (already handled above)
      if (msg.text?.startsWith('/') || msg.photo) {
        return;
      }

      await this.handleTextMessage(msg);
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (query) => {
      await this.handleCallbackQuery(query);
    });

    // Handle errors
    this.bot.on('error', (error: any) => {
      console.error('Telegram bot error:', error);
      
      // Handle polling conflicts (409 errors)
      if (error.code === 'ETELEGRAM' && (error.response?.error_code === 409 || error.message?.includes('409'))) {
        console.error('⚠️  Polling conflict detected (409). Another bot instance may be running.');
        console.error('   Solutions:');
        console.error('   1. Stop all other bot instances');
        console.error('   2. Delete webhook if set: curl -X POST https://api.telegram.org/bot<TOKEN>/deleteWebhook');
        console.error('   3. Wait a few seconds and restart');
        // Don't crash, just log the error
      }
    });
    
    // Handle polling errors specifically
    this.bot.on('polling_error', (error: any) => {
      if (error.code === 'ETELEGRAM' && (error.response?.error_code === 409 || error.message?.includes('409'))) {
        console.error('⚠️  Polling error (409): Multiple instances detected');
        console.error('   This usually means:');
        console.error('   - Another server instance is running');
        console.error('   - A webhook is still active');
        console.error('   - Another bot with the same token is running');
        // Try to recover by stopping and restarting polling
        setTimeout(async () => {
          try {
            await this.bot.stopPolling();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.bot.deleteWebHook();
            await this.bot.startPolling();
            console.log('🔄 Restarted polling after conflict');
          } catch (recoverError) {
            console.error('Failed to recover from polling conflict:', recoverError);
          }
        }, 5000);
      } else {
        console.error('Polling error:', error);
        // Stop polling to avoid continuous errors
        this.bot.stopPolling();
        this.isRunning = false;
      }
    });
  }

  /**
   * Handle /start command
   */
  private async handleStartCommand(msg: TelegramBot.Message): Promise<void> {
    try {
      const chatId = msg.chat.id;
      const telegramId = msg.from?.id.toString();

      if (!telegramId) {
        await this.bot.sendMessage(chatId, 'Sorry, I couldn\'t identify you. Please try again.');
        return;
      }

      // Check if user already exists
      const existingUser = await this.userService.getUserByTelegramId(telegramId);

      if (existingUser.success) {
        // Welcome back existing user
        const welcomeMessage = `Welcome back, ${existingUser.data?.profile.name || 'friend'}! 💪\n\nI'm here to help you with your fitness journey. What would you like to do today?`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🏋️ Plan Workout', callback_data: 'plan_workout' },
              { text: '🍽️ Nutrition Help', callback_data: 'nutrition_help' }
            ],
            [
              { text: '📊 View Progress', callback_data: 'view_progress' },
              { text: '🏃 Find Gyms', callback_data: 'find_gyms' }
            ]
          ]
        };

        await this.bot.sendMessage(chatId, welcomeMessage, {
          reply_markup: keyboard
        });
      } else {
        // Start onboarding for new user
        const onboardingResult = await this.aiService.startOnboarding(telegramId);
        
        if (onboardingResult.success) {
          await this.bot.sendMessage(chatId, onboardingResult.data!.message);
        } else {
          await this.bot.sendMessage(chatId, 
            'Welcome to Fit Buddy! 🎉\n\nI\'m your AI fitness companion, here to help you achieve your fitness goals with personalized workouts, nutrition advice, and motivation.\n\nLet\'s start by getting to know you better. What\'s your name?'
          );
        }
      }
    } catch (error) {
      console.error('Error handling /start command:', error);
      await this.bot.sendMessage(msg.chat.id, 'Welcome to Fit Buddy! I\'m here to help you with your fitness journey. 💪');
    }
  }

  /**
   * Handle /help command
   */
  private async handleHelpCommand(msg: TelegramBot.Message): Promise<void> {
    const helpMessage = `🤖 **Fit Buddy Help**

I'm your AI fitness companion! Here's what I can help you with:

**Commands:**
/start - Get started or return to main menu
/profile - View or update your profile
/workout - Plan workouts and log exercises
/nutrition - Get meal plans and track food
/help - Show this help message

**What I can do:**
💪 Create personalized workout plans
🍽️ Suggest Nigerian-friendly meal plans
📊 Track your progress and suggest PRs
🏋️ Guide you through gym sessions
📸 Analyze food photos for calories
🏃 Find gyms near you
💬 Chat naturally about fitness

**Tips:**
- Send me photos of your meals for calorie analysis
- Tell me when you're at the gym for workout guidance
- Ask me anything about fitness, nutrition, or health
- I adapt to your goals: lean, bulk, or maintain

Just start chatting with me naturally! 😊`;

    await this.bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /profile command
   */
  private async handleProfileCommand(msg: TelegramBot.Message): Promise<void> {
    try {
      const telegramId = msg.from?.id.toString();
      if (!telegramId) return;

      const userResult = await this.userService.getUserByTelegramId(telegramId);

      if (userResult.success && userResult.data) {
        const user = userResult.data;
        const profileMessage = `👤 **Your Profile**

**Name:** ${user.profile.name}
**Age:** ${user.profile.age} years
**Height:** ${user.profile.height} cm
**Weight:** ${user.profile.weight} kg
**BMI:** ${user.profile.bmi} (${this.getBMICategory(user.profile.bmi)})
**Goal:** ${user.profile.fitnessGoal}
**Training Style:** ${user.profile.trainingPhilosophy}
**Experience:** ${user.profile.experienceLevel}
**Workout Days:** ${user.schedule.workoutDaysPerWeek} days/week`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Update Profile', callback_data: 'update_profile' },
              { text: '⚙️ Settings', callback_data: 'settings' }
            ]
          ]
        };

        await this.bot.sendMessage(msg.chat.id, profileMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        await this.bot.sendMessage(msg.chat.id, 
          'You don\'t have a profile yet. Send /start to get started with your fitness journey!'
        );
      }
    } catch (error) {
      console.error('Error handling /profile command:', error);
      await this.bot.sendMessage(msg.chat.id, 'Sorry, I couldn\'t retrieve your profile. Please try again.');
    }
  }

  /**
   * Handle /workout command
   */
  private async handleWorkoutCommand(msg: TelegramBot.Message): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏋️ Start Workout', callback_data: 'start_workout' },
          { text: '📋 View Plan', callback_data: 'view_workout_plan' }
        ],
        [
          { text: '📊 Log Exercise', callback_data: 'log_exercise' },
          { text: '📈 View Progress', callback_data: 'workout_progress' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id, 
      '🏋️ **Workout Center**\n\nWhat would you like to do with your workouts?', 
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  /**
   * Handle /nutrition command
   */
  private async handleNutritionCommand(msg: TelegramBot.Message): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🍽️ Meal Plan', callback_data: 'meal_plan' },
          { text: '📸 Analyze Food', callback_data: 'analyze_food' }
        ],
        [
          { text: '📊 Track Calories', callback_data: 'track_calories' },
          { text: '🥗 Nigerian Recipes', callback_data: 'nigerian_recipes' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id, 
      '🍽️ **Nutrition Center**\n\nHow can I help with your nutrition today?', 
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  /**
   * Handle photo messages (food analysis)
   */
  private async handlePhotoMessage(msg: TelegramBot.Message): Promise<void> {
    try {
      const telegramId = msg.from?.id.toString();
      if (!telegramId || !msg.photo) return;

      await this.bot.sendMessage(msg.chat.id, '📸 Analyzing your food... This might take a moment!');

      // Get the highest resolution photo
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await this.bot.getFileLink(photo.file_id);
      
      // Download the image
      const response = await fetch(fileLink);
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Analyze the image
      const analysisResult = await this.aiService.analyzeImage(telegramId, imageBuffer, 'food_analysis');

      if (analysisResult.success) {
        await this.bot.sendMessage(msg.chat.id, analysisResult.data!.message);
      } else {
        await this.bot.sendMessage(msg.chat.id, 
          'I\'m having trouble analyzing that image. Could you describe what you\'re eating instead? 🤔'
        );
      }
    } catch (error) {
      console.error('Error handling photo message:', error);
      await this.bot.sendMessage(msg.chat.id, 
        'Sorry, I couldn\'t analyze that image. Please try again or describe your meal to me! 📸'
      );
    }
  }

  /**
   * Handle regular text messages
   */
  private async handleTextMessage(msg: TelegramBot.Message): Promise<void> {
    try {
      const telegramId = msg.from?.id.toString();
      const messageText = msg.text;

      if (!telegramId || !messageText) return;

      console.log(`📨 Processing message from ${telegramId}: ${messageText.substring(0, 50)}...`);

      // Process message through AI service
      const aiResponse = await this.aiService.processMessage(telegramId, messageText);

      if (aiResponse.success) {
        const response = aiResponse.data!;
        
        // Send the AI response
        await this.bot.sendMessage(msg.chat.id, response.message);

        // Send suggestions as inline keyboard if available
        if (response.suggestions && response.suggestions.length > 0) {
          const keyboard = {
            inline_keyboard: response.suggestions.slice(0, 4).map(suggestion => [
              { text: suggestion, callback_data: `suggest_${suggestion.toLowerCase().replace(/\s+/g, '_')}` }
            ])
          };

          await this.bot.sendMessage(msg.chat.id, 'Here are some suggestions:', {
            reply_markup: keyboard
          });
        }
      } else {
        // Log the error for debugging
        console.error('❌ AI Service Error:', {
          code: aiResponse.error?.code,
          message: aiResponse.error?.message,
          userMessage: aiResponse.error?.userMessage,
        });
        
        await this.bot.sendMessage(msg.chat.id, 
          aiResponse.error?.userMessage || 'I\'m having trouble understanding right now. Could you try rephrasing that? 🤔'
        );
      }
    } catch (error: any) {
      console.error('❌ Error handling text message:', {
        error: error.message,
        stack: error.stack,
        telegramId: msg.from?.id,
      });
      await this.bot.sendMessage(msg.chat.id, 
        'I\'m having some technical difficulties. Please try again in a moment! 🔧'
      );
    }
  }

  /**
   * Handle callback queries (button presses)
   */
  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    try {
      const chatId = query.message?.chat.id;
      const data = query.data;
      const telegramId = query.from.id.toString();

      if (!chatId || !data) return;

      // Acknowledge the callback query
      await this.bot.answerCallbackQuery(query.id);

      // Handle different callback actions
      switch (data) {
        case 'plan_workout':
          await this.bot.sendMessage(chatId, 'Let me help you plan your workout! What muscle groups do you want to focus on today?');
          break;

        case 'nutrition_help':
          await this.bot.sendMessage(chatId, 'I\'d love to help with your nutrition! Are you looking for meal ideas, calorie tracking, or something specific?');
          break;

        case 'view_progress':
          await this.bot.sendMessage(chatId, 'Let me show you your progress! What would you like to see - weight changes, workout improvements, or overall stats?');
          break;

        case 'find_gyms':
          await this.bot.sendMessage(chatId, 'I can help you find gyms! Please share your location or tell me which area you\'re looking in.');
          break;

        case 'start_workout':
          const sessionId = `session_${Date.now()}`;
          const workoutResponse = await this.aiService.handleWorkoutSession(telegramId, sessionId);
          
          if (workoutResponse.success) {
            await this.bot.sendMessage(chatId, workoutResponse.data!.message);
          } else {
            await this.bot.sendMessage(chatId, 'Ready to start your workout? Let me know what exercises you\'re planning to do!');
          }
          break;

        case 'analyze_food':
          await this.bot.sendMessage(chatId, '📸 Send me a photo of your food and I\'ll analyze the calories and nutrients for you!');
          break;

        default:
          // Handle suggestion callbacks
          if (data.startsWith('suggest_')) {
            const suggestion = data.replace('suggest_', '').replace(/_/g, ' ');
            await this.handleTextMessage({
              ...query.message!,
              text: suggestion,
              from: query.from
            } as TelegramBot.Message);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
      if (query.message?.chat.id) {
        await this.bot.sendMessage(query.message.chat.id, 'Something went wrong. Please try again! 🔧');
      }
    }
  }

  /**
   * Get BMI category helper
   */
  private getBMICategory(bmi: number): string {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal weight';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<TelegramBot.User> {
    return await this.bot.getMe();
  }

  /**
   * Check if bot is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}