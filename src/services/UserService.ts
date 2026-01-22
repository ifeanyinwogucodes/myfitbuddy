import { ObjectId } from 'mongodb';
import { database } from '../database/connection';
import { User, UserProfile, UserSchedule, UserPreferences, ApiResponse } from '../types';
import { 
  calculateBMI, 
  validateUserProfile, 
  validateUserSchedule, 
  validateUserPreferences,
  sanitizeString
} from '../utils/validation';
import { createError } from '../middleware/errorHandler';

export class UserService {
  private get usersCollection() {
    return database.getSchemas().getUsersCollection();
  }

  /**
   * Create a new user profile
   */
  async createUser(userData: Partial<User>): Promise<ApiResponse<User>> {
    try {
      // Validate required fields
      if (!userData.profile) {
        throw createError('User profile is required', 400);
      }

      // Calculate BMI if height and weight are provided
      if (userData.profile.height && userData.profile.weight) {
        userData.profile.bmi = calculateBMI(userData.profile.weight, userData.profile.height);
      }

      // Validate profile data
      const profileValidation = validateUserProfile(userData.profile);
      if (profileValidation.error) {
        throw createError(`Profile validation failed: ${profileValidation.error}`, 400);
      }

      // Validate schedule if provided
      if (userData.schedule) {
        const scheduleValidation = validateUserSchedule(userData.schedule);
        if (scheduleValidation.error) {
          throw createError(`Schedule validation failed: ${scheduleValidation.error}`, 400);
        }
      }

      // Validate preferences if provided
      if (userData.preferences) {
        const preferencesValidation = validateUserPreferences(userData.preferences);
        if (preferencesValidation.error) {
          throw createError(`Preferences validation failed: ${preferencesValidation.error}`, 400);
        }
      }

      // Set default values
      const now = new Date();
      const newUser: User = {
        telegramId: userData.telegramId,
        profile: profileValidation.value!,
        schedule: userData.schedule || {
          workDays: [],
          availableHours: [],
          preferredWorkoutDuration: 60,
          workoutDaysPerWeek: 3,
        },
        preferences: userData.preferences || {
          reminderFrequency: 'daily',
          humorEnabled: true,
          conversationStyle: 'casual',
        },
        createdAt: now,
        updatedAt: now,
      };

      const result = await this.usersCollection.insertOne(newUser);
      const createdUser = await this.usersCollection.findOne({ _id: result.insertedId });

      if (!createdUser) {
        throw createError('Failed to retrieve created user', 500);
      }

      return {
        success: true,
        data: createdUser,
        metadata: {
          userId: result.insertedId,
          bmiCategory: this.getBMICategory(createdUser.profile.bmi),
        },
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      return {
        success: false,
        error: {
          code: error.name || 'USER_CREATION_ERROR',
          message: error.message,
          userMessage: 'Failed to create user profile. Please check your information and try again.',
        },
      };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<ApiResponse<User>> {
    try {
      if (!ObjectId.isValid(userId)) {
        throw createError('Invalid user ID format', 400);
      }

      const user = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      
      if (!user) {
        throw createError('User not found', 404);
      }

      return {
        success: true,
        data: user,
        metadata: {
          bmiCategory: this.getBMICategory(user.profile.bmi),
          profileCompleteness: this.calculateProfileCompleteness(user),
        },
      };
    } catch (error: any) {
      console.error('Error getting user by ID:', error);
      return {
        success: false,
        error: {
          code: error.name || 'USER_FETCH_ERROR',
          message: error.message,
          userMessage: 'Failed to retrieve user profile.',
        },
      };
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: string): Promise<ApiResponse<User>> {
    try {
      const user = await this.usersCollection.findOne({ telegramId: sanitizeString(telegramId) });
      
      if (!user) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            userMessage: 'No user profile found for this Telegram account.',
          },
        };
      }

      return {
        success: true,
        data: user,
        metadata: {
          bmiCategory: this.getBMICategory(user.profile.bmi),
          profileCompleteness: this.calculateProfileCompleteness(user),
        },
      };
    } catch (error: any) {
      console.error('Error getting user by Telegram ID:', error);
      return {
        success: false,
        error: {
          code: error.name || 'USER_FETCH_ERROR',
          message: error.message,
          userMessage: 'Failed to retrieve user profile.',
        },
      };
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, profileUpdates: Partial<UserProfile>): Promise<ApiResponse<User>> {
    try {
      if (!ObjectId.isValid(userId)) {
        throw createError('Invalid user ID format', 400);
      }

      const user = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        throw createError('User not found', 404);
      }

      // Merge updates with existing profile
      const updatedProfile = { ...user.profile, ...profileUpdates };

      // Recalculate BMI if height or weight changed
      if (profileUpdates.height || profileUpdates.weight) {
        updatedProfile.bmi = calculateBMI(updatedProfile.weight, updatedProfile.height);
      }

      // Validate updated profile
      const validation = validateUserProfile(updatedProfile);
      if (validation.error) {
        throw createError(`Profile validation failed: ${validation.error}`, 400);
      }

      const result = await this.usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            profile: validation.value!,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw createError('User not found', 404);
      }

      const updatedUser = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      
      return {
        success: true,
        data: updatedUser!,
        metadata: {
          bmiCategory: this.getBMICategory(updatedUser!.profile.bmi),
          bmiChanged: user.profile.bmi !== updatedUser!.profile.bmi,
        },
      };
    } catch (error: any) {
      console.error('Error updating user profile:', error);
      return {
        success: false,
        error: {
          code: error.name || 'PROFILE_UPDATE_ERROR',
          message: error.message,
          userMessage: 'Failed to update profile. Please check your information and try again.',
        },
      };
    }
  }

  /**
   * Update user schedule
   */
  async updateUserSchedule(userId: string, scheduleUpdates: Partial<UserSchedule>): Promise<ApiResponse<User>> {
    try {
      if (!ObjectId.isValid(userId)) {
        throw createError('Invalid user ID format', 400);
      }

      const user = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        throw createError('User not found', 404);
      }

      // Merge updates with existing schedule
      const updatedSchedule = { ...user.schedule, ...scheduleUpdates };

      // Validate updated schedule
      const validation = validateUserSchedule(updatedSchedule);
      if (validation.error) {
        throw createError(`Schedule validation failed: ${validation.error}`, 400);
      }

      const result = await this.usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            schedule: validation.value!,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw createError('User not found', 404);
      }

      const updatedUser = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      
      return {
        success: true,
        data: updatedUser!,
        metadata: {
          scheduleChanged: true,
          workoutDaysChanged: user.schedule.workoutDaysPerWeek !== updatedUser!.schedule.workoutDaysPerWeek,
        },
      };
    } catch (error: any) {
      console.error('Error updating user schedule:', error);
      return {
        success: false,
        error: {
          code: error.name || 'SCHEDULE_UPDATE_ERROR',
          message: error.message,
          userMessage: 'Failed to update schedule. Please check your information and try again.',
        },
      };
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, preferencesUpdates: Partial<UserPreferences>): Promise<ApiResponse<User>> {
    try {
      if (!ObjectId.isValid(userId)) {
        throw createError('Invalid user ID format', 400);
      }

      const user = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        throw createError('User not found', 404);
      }

      // Merge updates with existing preferences
      const updatedPreferences = { ...user.preferences, ...preferencesUpdates };

      // Validate updated preferences
      const validation = validateUserPreferences(updatedPreferences);
      if (validation.error) {
        throw createError(`Preferences validation failed: ${validation.error}`, 400);
      }

      const result = await this.usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            preferences: validation.value!,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw createError('User not found', 404);
      }

      const updatedUser = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
      
      return {
        success: true,
        data: updatedUser!,
      };
    } catch (error: any) {
      console.error('Error updating user preferences:', error);
      return {
        success: false,
        error: {
          code: error.name || 'PREFERENCES_UPDATE_ERROR',
          message: error.message,
          userMessage: 'Failed to update preferences.',
        },
      };
    }
  }

  /**
   * Set fitness goal and update related settings
   */
  async setFitnessGoal(userId: string, goal: 'lean' | 'bulk' | 'maintain'): Promise<ApiResponse<User>> {
    try {
      const result = await this.updateUserProfile(userId, { fitnessGoal: goal });
      
      if (result.success && result.data) {
        // Additional logic based on goal change could go here
        // e.g., adjust workout recommendations, meal plans, etc.
        
        return {
          ...result,
          metadata: {
            ...result.metadata,
            goalChanged: true,
            recommendations: this.getGoalRecommendations(goal, result.data.profile.bmi),
          },
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('Error setting fitness goal:', error);
      return {
        success: false,
        error: {
          code: 'GOAL_UPDATE_ERROR',
          message: error.message,
          userMessage: 'Failed to update fitness goal.',
        },
      };
    }
  }

  /**
   * Set training philosophy
   */
  async setTrainingPhilosophy(userId: string, philosophy: 'mentzer' | 'arnold' | 'custom'): Promise<ApiResponse<User>> {
    try {
      const result = await this.updateUserProfile(userId, { trainingPhilosophy: philosophy });
      
      if (result.success && result.data) {
        return {
          ...result,
          metadata: {
            ...result.metadata,
            philosophyChanged: true,
            philosophyDescription: this.getPhilosophyDescription(philosophy),
          },
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('Error setting training philosophy:', error);
      return {
        success: false,
        error: {
          code: 'PHILOSOPHY_UPDATE_ERROR',
          message: error.message,
          userMessage: 'Failed to update training philosophy.',
        },
      };
    }
  }

  /**
   * Delete user account
   */
  async deleteUser(userId: string): Promise<ApiResponse<void>> {
    try {
      if (!ObjectId.isValid(userId)) {
        throw createError('Invalid user ID format', 400);
      }

      const result = await this.usersCollection.deleteOne({ _id: new ObjectId(userId) });
      
      if (result.deletedCount === 0) {
        throw createError('User not found', 404);
      }

      return {
        success: true,
        metadata: {
          deletedAt: new Date(),
        },
      };
    } catch (error: any) {
      console.error('Error deleting user:', error);
      return {
        success: false,
        error: {
          code: error.name || 'USER_DELETE_ERROR',
          message: error.message,
          userMessage: 'Failed to delete user account.',
        },
      };
    }
  }

  // Helper methods

  private getBMICategory(bmi: number): string {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal weight';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
  }

  private calculateProfileCompleteness(user: User): number {
    const fields = [
      user.profile.name,
      user.profile.age,
      user.profile.height,
      user.profile.weight,
      user.profile.fitnessGoal,
      user.profile.trainingPhilosophy,
      user.profile.experienceLevel,
      user.schedule.workoutDaysPerWeek > 0,
      user.schedule.availableHours.length > 0,
    ];
    
    const completedFields = fields.filter(field => field && field !== '').length;
    return Math.round((completedFields / fields.length) * 100);
  }

  private getGoalRecommendations(goal: 'lean' | 'bulk' | 'maintain', bmi: number): string[] {
    const recommendations: string[] = [];
    
    switch (goal) {
      case 'lean':
        recommendations.push('Focus on higher rep ranges (12-15 reps)');
        recommendations.push('Include cardio 3-4 times per week');
        recommendations.push('Maintain a caloric deficit');
        if (bmi > 25) {
          recommendations.push('Consider reducing portion sizes gradually');
        }
        break;
      case 'bulk':
        recommendations.push('Focus on compound movements');
        recommendations.push('Use progressive overload (6-8 reps)');
        recommendations.push('Maintain a caloric surplus');
        recommendations.push('Prioritize protein intake (1.6-2.2g per kg body weight)');
        break;
      case 'maintain':
        recommendations.push('Balance strength and cardio training');
        recommendations.push('Maintain current caloric intake');
        recommendations.push('Focus on consistency over intensity');
        break;
    }
    
    return recommendations;
  }

  private getPhilosophyDescription(philosophy: 'mentzer' | 'arnold' | 'custom'): string {
    switch (philosophy) {
      case 'mentzer':
        return 'High-intensity, low-volume training with focus on training to failure';
      case 'arnold':
        return 'High-volume training with multiple sets and exercises per muscle group';
      case 'custom':
        return 'Personalized approach based on your preferences and responses';
      default:
        return 'Unknown training philosophy';
    }
  }
}