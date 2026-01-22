import { Db, Collection } from 'mongodb';
import { 
  User, 
  WorkoutPlan, 
  WorkoutSession, 
  Exercise, 
  MealPlan, 
  FoodItem, 
  FoodLog, 
  Gym, 
  Conversation, 
  UserProgress 
} from '../types';

export class DatabaseSchemas {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async createIndexes(): Promise<void> {
    try {
      console.log('Creating database indexes...');

      // Users collection indexes
      const usersCollection = this.db.collection<User>('users');
      await usersCollection.createIndex({ telegramId: 1 }, { unique: true, sparse: true });
      await usersCollection.createIndex({ 'profile.bmi': 1 });
      await usersCollection.createIndex({ createdAt: 1 });

      // Workout plans collection indexes
      const workoutPlansCollection = this.db.collection<WorkoutPlan>('workout_plans');
      await workoutPlansCollection.createIndex({ userId: 1, isActive: 1 });
      await workoutPlansCollection.createIndex({ createdAt: -1 });

      // Workout sessions collection indexes
      const workoutSessionsCollection = this.db.collection<WorkoutSession>('workout_sessions');
      await workoutSessionsCollection.createIndex({ userId: 1, startTime: -1 });
      await workoutSessionsCollection.createIndex({ isCompleted: 1 });

      // Exercises collection indexes
      const exercisesCollection = this.db.collection<Exercise>('exercises');
      await exercisesCollection.createIndex({ name: 1 });
      await exercisesCollection.createIndex({ category: 1 });
      await exercisesCollection.createIndex({ muscleGroups: 1 });
      await exercisesCollection.createIndex({ difficulty: 1 });

      // Meal plans collection indexes
      const mealPlansCollection = this.db.collection<MealPlan>('meal_plans');
      await mealPlansCollection.createIndex({ userId: 1, isActive: 1 });
      await mealPlansCollection.createIndex({ createdAt: -1 });

      // Food items collection indexes
      const foodItemsCollection = this.db.collection<FoodItem>('food_items');
      await foodItemsCollection.createIndex({ name: 1 });
      await foodItemsCollection.createIndex({ localNames: 1 });
      await foodItemsCollection.createIndex({ category: 1 });
      await foodItemsCollection.createIndex({ availability: 1 });

      // Food logs collection indexes
      const foodLogsCollection = this.db.collection<FoodLog>('food_logs');
      await foodLogsCollection.createIndex({ userId: 1, timestamp: -1 });

      // Gyms collection indexes
      const gymsCollection = this.db.collection<Gym>('gyms');
      await gymsCollection.createIndex({ 'location.coordinates': '2dsphere' });
      await gymsCollection.createIndex({ qualityTier: 1, 'location.city': 1 });
      await gymsCollection.createIndex({ verificationStatus: 1 });
      await gymsCollection.createIndex({ name: 1 });

      // Conversations collection indexes
      const conversationsCollection = this.db.collection<Conversation>('conversations');
      await conversationsCollection.createIndex({ userId: 1, updatedAt: -1 });
      await conversationsCollection.createIndex(
        { createdAt: 1 }, 
        { expireAfterSeconds: 2592000 } // 30 days TTL
      );

      // User progress collection indexes
      const userProgressCollection = this.db.collection<UserProgress>('user_progress');
      await userProgressCollection.createIndex({ userId: 1, date: -1 });

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Error creating database indexes:', error);
      throw error;
    }
  }

  async createValidationRules(): Promise<void> {
    try {
      console.log('Creating collection validation rules...');

      // Users collection validation
      await this.db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['profile', 'schedule', 'preferences', 'createdAt', 'updatedAt'],
            properties: {
              telegramId: { bsonType: 'string' },
              profile: {
                bsonType: 'object',
                required: ['name', 'age', 'height', 'weight', 'bmi', 'fitnessGoal', 'trainingPhilosophy', 'experienceLevel'],
                properties: {
                  name: { bsonType: 'string', minLength: 1 },
                  age: { bsonType: 'number', minimum: 13, maximum: 100 },
                  height: { bsonType: 'number', minimum: 100, maximum: 250 },
                  weight: { bsonType: 'number', minimum: 30, maximum: 300 },
                  bmi: { bsonType: 'number', minimum: 10, maximum: 50 },
                  fitnessGoal: { enum: ['lean', 'bulk', 'maintain'] },
                  trainingPhilosophy: { enum: ['mentzer', 'arnold', 'custom'] },
                  experienceLevel: { enum: ['beginner', 'intermediate', 'advanced'] }
                }
              },
              schedule: {
                bsonType: 'object',
                required: ['workDays', 'availableHours', 'preferredWorkoutDuration', 'workoutDaysPerWeek'],
                properties: {
                  workDays: { bsonType: 'array', items: { bsonType: 'string' } },
                  availableHours: { bsonType: 'array' },
                  preferredWorkoutDuration: { bsonType: 'number', minimum: 15, maximum: 180 },
                  workoutDaysPerWeek: { bsonType: 'number', minimum: 1, maximum: 7 }
                }
              },
              preferences: {
                bsonType: 'object',
                required: ['reminderFrequency', 'humorEnabled', 'conversationStyle'],
                properties: {
                  reminderFrequency: { bsonType: 'string' },
                  humorEnabled: { bsonType: 'bool' },
                  conversationStyle: { enum: ['casual', 'professional', 'motivational'] }
                }
              },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' }
            }
          }
        }
      });

      // Gyms collection validation
      await this.db.createCollection('gyms', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'location', 'qualityTier', 'verificationStatus', 'createdAt'],
            properties: {
              name: { bsonType: 'string', minLength: 1 },
              location: {
                bsonType: 'object',
                required: ['address', 'coordinates', 'city', 'state'],
                properties: {
                  address: { bsonType: 'string', minLength: 1 },
                  coordinates: {
                    bsonType: 'array',
                    items: { bsonType: 'number' },
                    minItems: 2,
                    maxItems: 2
                  },
                  city: { bsonType: 'string', minLength: 1 },
                  state: { bsonType: 'string', minLength: 1 }
                }
              },
              qualityTier: { enum: ['local', 'medium', 'standard', 'ultra_standard'] },
              verificationStatus: { enum: ['pending', 'verified', 'rejected'] },
              createdAt: { bsonType: 'date' }
            }
          }
        }
      });

      console.log('Collection validation rules created successfully');
    } catch (error: any) {
      // Collections might already exist, which is fine
      if (error?.codeName !== 'NamespaceExists') {
        console.error('Error creating validation rules:', error);
      }
    }
  }

  // Collection getters for type safety
  getUsersCollection(): Collection<User> {
    return this.db.collection<User>('users');
  }

  getWorkoutPlansCollection(): Collection<WorkoutPlan> {
    return this.db.collection<WorkoutPlan>('workout_plans');
  }

  getWorkoutSessionsCollection(): Collection<WorkoutSession> {
    return this.db.collection<WorkoutSession>('workout_sessions');
  }

  getExercisesCollection(): Collection<Exercise> {
    return this.db.collection<Exercise>('exercises');
  }

  getMealPlansCollection(): Collection<MealPlan> {
    return this.db.collection<MealPlan>('meal_plans');
  }

  getFoodItemsCollection(): Collection<FoodItem> {
    return this.db.collection<FoodItem>('food_items');
  }

  getFoodLogsCollection(): Collection<FoodLog> {
    return this.db.collection<FoodLog>('food_logs');
  }

  getGymsCollection(): Collection<Gym> {
    return this.db.collection<Gym>('gyms');
  }

  getConversationsCollection(): Collection<Conversation> {
    return this.db.collection<Conversation>('conversations');
  }

  getUserProgressCollection(): Collection<UserProgress> {
    return this.db.collection<UserProgress>('user_progress');
  }
}