import { UserService } from './UserService';
import { OpenRouterClient } from './OpenRouterClient';
import { User, UserProfile, UserSchedule } from '../types';
import { calculateBMI } from '../utils/validation';

export type OnboardingStep = 
  | 'welcome'
  | 'name'
  | 'has_timetable'
  | 'current_timetable'
  | 'gym_time'
  | 'height'
  | 'weight'
  | 'training_philosophy'
  | 'suggest_timetable'
  | 'confirm_schedule'
  | 'complete';

export interface OnboardingState {
  step: OnboardingStep;
  data: {
    name?: string;
    hasTimetable?: boolean;
    currentTimetable?: string;
    gymTime?: string;
    height?: number;
    weight?: number;
    bmi?: number;
    trainingPhilosophy?: 'mentzer' | 'arnold' | 'custom';
    suggestedTimetable?: string;
    workoutDaysPerWeek?: number;
  };
}

export class OnboardingService {
  private userService: UserService;
  private openRouterClient: OpenRouterClient;

  constructor() {
    this.userService = new UserService();
    this.openRouterClient = new OpenRouterClient();
  }

  /**
   * Process onboarding step based on user input
   */
  async processOnboardingStep(
    telegramId: string,
    currentStep: OnboardingStep,
    userInput: string,
    state: OnboardingState
  ): Promise<{ success: boolean; message: string; nextStep?: OnboardingStep; state: OnboardingState; userCreated?: boolean }> {
    try {
      let nextStep: OnboardingStep | undefined;
      let message = '';
      const newState = { ...state };

      switch (currentStep) {
        case 'welcome':
        case 'name':
          // Extract name from input
          const name = this.extractName(userInput);
          if (!name) {
            return {
              success: false,
              message: 'I\'d love to know your name! Could you tell me what you\'d like me to call you?',
              state: newState,
            };
          }
          newState.data.name = name;
          nextStep = 'has_timetable';
          message = `Nice to meet you, ${name}! 👋\n\nNow, do you currently follow a workout timetable or schedule? Please answer with "yes" or "no".`;
          break;

        case 'has_timetable':
          const hasTimetable = this.parseYesNo(userInput);
          if (hasTimetable === null) {
            return {
              success: false,
              message: 'Please let me know - do you have a current workout timetable? Answer "yes" or "no".',
              state: newState,
            };
          }
          newState.data.hasTimetable = hasTimetable;
          
          if (hasTimetable) {
            nextStep = 'current_timetable';
            message = 'Great! I\'d love to know about your current workout schedule. Can you tell me what days you work out and what you do on those days? For example: "Monday, Wednesday, Friday - Upper body, Lower body, Full body"';
          } else {
            nextStep = 'gym_time';
            message = 'No problem! We\'ll work together to create one that fits your schedule. First, what time do you usually go to the gym, or what time would you prefer? (e.g., "6 AM", "evening", "after work")';
          }
          break;

        case 'current_timetable':
          newState.data.currentTimetable = userInput.trim();
          nextStep = 'gym_time';
          message = `Got it! I've noted your current schedule: ${userInput}\n\nWhat time do you usually go to the gym, or what time would you prefer? (e.g., "6 AM", "evening", "after work")`;
          break;

        case 'gym_time':
          const gymTime = this.extractTime(userInput);
          if (!gymTime) {
            return {
              success: false,
              message: 'I need to know your preferred gym time to send you timely reminders. Can you tell me when you usually go or would like to go? (e.g., "6 AM", "7 PM", "evening")',
              state: newState,
            };
          }
          newState.data.gymTime = gymTime;
          nextStep = 'height';
          message = `Perfect! I'll make sure to check in with you around ${gymTime}. 💪\n\nNow, to help me give you the best recommendations, I need to know your height. What's your height? (You can tell me in cm or feet/inches, like "175 cm" or "5'9")`;
          break;

        case 'height':
          const height = this.extractHeight(userInput);
          if (!height) {
            return {
              success: false,
              message: 'I need your height to calculate your BMI and give you personalized recommendations. Can you tell me your height? (e.g., "175 cm" or "5 feet 9 inches")',
              state: newState,
            };
          }
          newState.data.height = height;
          nextStep = 'weight';
          message = `Got it! ${height} cm. Now, what's your current weight? (You can tell me in kg or lbs, like "70 kg" or "154 lbs")`;
          break;

        case 'weight':
          const weight = this.extractWeight(userInput);
          if (!weight) {
            return {
              success: false,
              message: 'I need your weight to calculate your BMI. Can you tell me your current weight? (e.g., "70 kg" or "154 lbs")',
              state: newState,
            };
          }
          newState.data.weight = weight;
          newState.data.bmi = calculateBMI(weight, newState.data.height!);
          nextStep = 'training_philosophy';
          message = `Perfect! Your BMI is ${newState.data.bmi.toFixed(1)}.\n\nNow, I'd like to know your training philosophy. Do you prefer:\n1. **Arnold's approach** - High volume, multiple sets and exercises per muscle group\n2. **Mike Mentzer's approach** - High intensity, low volume, training to failure\n3. **Not sure / Balanced** - A mix of both approaches\n\nJust tell me which number or the name!`;
          break;

        case 'training_philosophy':
          const philosophy = this.extractTrainingPhilosophy(userInput);
          if (!philosophy) {
            return {
              success: false,
              message: 'Please choose your training philosophy:\n1. Arnold\'s approach (high volume)\n2. Mike Mentzer\'s approach (high intensity)\n3. Not sure / Balanced',
              state: newState,
            };
          }
          newState.data.trainingPhilosophy = philosophy;
          
          if (!newState.data.hasTimetable) {
            nextStep = 'suggest_timetable';
            message = `Great choice! ${philosophy === 'arnold' ? 'Arnold\'s high-volume approach' : philosophy === 'mentzer' ? 'Mike Mentzer\'s high-intensity approach' : 'A balanced approach'} it is! 💪\n\nSince you don't have a current timetable, would you like me to suggest a 3-day plan or a full week plan? Just say "3 days" or "1 week".`;
          } else {
            nextStep = 'confirm_schedule';
            message = `Perfect! I've got all your information. Let me confirm what I have:\n\n• Name: ${newState.data.name}\n• Current Schedule: ${newState.data.currentTimetable}\n• Gym Time: ${newState.data.gymTime}\n• Training Philosophy: ${philosophy === 'arnold' ? 'Arnold (High Volume)' : philosophy === 'mentzer' ? 'Mentzer (High Intensity)' : 'Balanced'}\n\nDoes this look correct? Say "yes" to continue or "no" to make changes.`;
          }
          break;

        case 'suggest_timetable':
          const planType = this.extractPlanType(userInput);
          if (!planType) {
            return {
              success: false,
              message: 'Would you like a 3-day plan or a full week plan? Just say "3 days" or "1 week".',
              state: newState,
            };
          }
          newState.data.workoutDaysPerWeek = planType === '3' ? 3 : 6;
          newState.data.suggestedTimetable = planType === '3' 
            ? '3-day split (e.g., Monday, Wednesday, Friday)'
            : '6-day split (e.g., Monday-Saturday)';
          nextStep = 'confirm_schedule';
          message = `Excellent! I'll create a ${planType === '3' ? '3-day' : '6-day'} workout plan for you.\n\nLet me confirm what I have:\n\n• Name: ${newState.data.name}\n• Gym Time: ${newState.data.gymTime}\n• Training Philosophy: ${newState.data.trainingPhilosophy === 'arnold' ? 'Arnold (High Volume)' : newState.data.trainingPhilosophy === 'mentzer' ? 'Mentzer (High Intensity)' : 'Balanced'}\n• Workout Plan: ${newState.data.suggestedTimetable}\n\nDoes this look correct? Say "yes" to finish setup or "no" to make changes.`;
          break;

        case 'confirm_schedule':
          const confirmed = this.parseYesNo(userInput);
          if (confirmed === null) {
            return {
              success: false,
              message: 'Please confirm - does everything look correct? Say "yes" or "no".',
              state: newState,
            };
          }
          
          if (confirmed) {
            // Create user profile
            const userResult = await this.createUserFromOnboarding(telegramId, newState);
            if (userResult.success) {
              nextStep = 'complete';
              message = `Perfect! 🎉 Your profile is all set up!\n\nI'll be your fitness partner and check in with you at ${newState.data.gymTime}. When you're at the gym, just let me know and I'll help you track your workouts!\n\nYou can start by saying "I'm at the gym" when you're ready to work out, or ask me anything about fitness! 💪`;
              return {
                success: true,
                message,
                nextStep,
                state: newState,
                userCreated: true,
              };
            } else {
              return {
                success: false,
                message: 'I had trouble saving your profile. Let me try again - can you confirm everything is correct?',
                state: newState,
              };
            }
          } else {
            // User wants to make changes
            nextStep = 'name';
            message = 'No problem! Let\'s go through it again. What\'s your name?';
            newState.step = 'name';
            newState.data = {}; // Reset data
            return {
              success: true,
              message,
              nextStep,
              state: newState,
            };
          }
          break;

        default:
          return {
            success: false,
            message: 'I\'m not sure what step we\'re on. Let\'s start over - what\'s your name?',
            state: { step: 'name', data: {} },
          };
      }

      newState.step = nextStep || currentStep;
      return {
        success: true,
        message,
        nextStep,
        state: newState,
      };
    } catch (error: any) {
      console.error('Error processing onboarding step:', error);
      return {
        success: false,
        message: 'I encountered an error. Let\'s try that again - can you repeat your answer?',
        state,
      };
    }
  }

  /**
   * Get the initial onboarding message
   */
  getInitialMessage(): string {
    return 'Welcome to Fit Buddy! 🎉\n\nI\'m your AI fitness companion, and I\'m here to be your workout partner. Let\'s get to know each other so I can help you reach your fitness goals!\n\nFirst things first - what\'s your name?';
  }

  /**
   * Create user from onboarding data
   */
  private async createUserFromOnboarding(telegramId: string, state: OnboardingState): Promise<{ success: boolean; user?: User }> {
    try {
      // Parse workout days from timetable or create default
      let workoutDays: string[] = [];
      let workoutDaysPerWeek = state.data.workoutDaysPerWeek || 3;
      
      if (state.data.currentTimetable) {
        // Try to extract days from timetable
        const daysMatch = state.data.currentTimetable.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi);
        if (daysMatch) {
          workoutDays = daysMatch.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase());
          workoutDaysPerWeek = workoutDays.length;
        }
      }

      // Parse gym time into available hours
      const availableHours = this.parseGymTime(state.data.gymTime || '');

      const userData: Partial<User> = {
        telegramId,
        profile: {
          name: state.data.name || 'User',
          age: 25, // Default, can be updated later
          height: state.data.height!,
          weight: state.data.weight!,
          bmi: state.data.bmi!,
          fitnessGoal: 'maintain', // Default, can be updated later
          trainingPhilosophy: state.data.trainingPhilosophy || 'custom',
          experienceLevel: 'beginner', // Default, can be updated later
        },
        schedule: {
          workDays: workoutDays,
          availableHours,
          preferredWorkoutDuration: 60, // Default 60 minutes
          workoutDaysPerWeek,
        },
        preferences: {
          reminderFrequency: 'daily',
          humorEnabled: true,
          conversationStyle: 'casual',
        },
      };

      const result = await this.userService.createUser(userData);
      return {
        success: result.success,
        user: result.data,
      };
    } catch (error) {
      console.error('Error creating user from onboarding:', error);
      return { success: false };
    }
  }

  // Helper methods for parsing user input

  private extractName(input: string): string | null {
    const cleaned = input.trim();
    if (cleaned.length < 2) return null;
    // Remove common prefixes
    const name = cleaned.replace(/^(my name is|i'm|i am|call me|it's|it is)\s+/i, '').trim();
    return name.length > 0 ? name : null;
  }

  private parseYesNo(input: string): boolean | null {
    const lower = input.toLowerCase().trim();
    if (['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'right', 'true'].includes(lower)) {
      return true;
    }
    if (['no', 'n', 'nope', 'nah', 'wrong', 'incorrect', 'false'].includes(lower)) {
      return false;
    }
    return null;
  }

  private extractTime(input: string): string | null {
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

  private extractHeight(input: string): number | null {
    const cleaned = input.toLowerCase().trim();
    
    // Try cm first
    const cmMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*cm/);
    if (cmMatch) {
      return parseFloat(cmMatch[1]);
    }
    
    // Try feet and inches
    const feetInchesMatch = cleaned.match(/(\d+)\s*(?:feet|ft|')\s*(\d+)?\s*(?:inches|in|")?/);
    if (feetInchesMatch) {
      const feet = parseFloat(feetInchesMatch[1]);
      const inches = feetInchesMatch[2] ? parseFloat(feetInchesMatch[2]) : 0;
      return Math.round((feet * 30.48) + (inches * 2.54));
    }
    
    // Try just a number (assume cm if > 100, otherwise feet)
    const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      if (num > 100) return num; // Likely cm
      if (num < 8) return Math.round(num * 30.48); // Likely feet
    }
    
    return null;
  }

  private extractWeight(input: string): number | null {
    const cleaned = input.toLowerCase().trim();
    
    // Try kg first
    const kgMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*kg/);
    if (kgMatch) {
      return parseFloat(kgMatch[1]);
    }
    
    // Try lbs
    const lbsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/);
    if (lbsMatch) {
      return Math.round(parseFloat(lbsMatch[1]) * 0.453592);
    }
    
    // Try just a number (assume kg if > 30, otherwise lbs)
    const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      if (num > 30 && num < 200) return num; // Likely kg
      if (num > 60 && num < 500) return Math.round(num * 0.453592); // Likely lbs
    }
    
    return null;
  }

  private extractTrainingPhilosophy(input: string): 'mentzer' | 'arnold' | 'custom' | null {
    const lower = input.toLowerCase().trim();
    
    if (lower.includes('1') || lower.includes('arnold') || lower.includes('volume') || lower.includes('high volume')) {
      return 'arnold';
    }
    if (lower.includes('2') || lower.includes('mentzer') || lower.includes('intensity') || lower.includes('high intensity')) {
      return 'mentzer';
    }
    if (lower.includes('3') || lower.includes('not sure') || lower.includes('balanced') || lower.includes('mix') || lower.includes('both')) {
      return 'custom';
    }
    
    return null;
  }

  private extractPlanType(input: string): '3' | '6' | null {
    const lower = input.toLowerCase().trim();
    if (lower.includes('3') || lower.includes('three') || lower.includes('3 day')) {
      return '3';
    }
    if (lower.includes('6') || lower.includes('six') || lower.includes('week') || lower.includes('1 week') || lower.includes('full week')) {
      return '6';
    }
    return null;
  }

  private parseGymTime(timeStr: string): Array<{ start: string; end: string }> {
    // Simple parsing - can be improved
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
    
    // Default to evening if can't parse
    return [{ start: '18:00', end: '20:00' }];
  }
}
