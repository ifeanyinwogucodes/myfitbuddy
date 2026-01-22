import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { UserService } from '../services/UserService';
import { DatabaseSchemas } from '../database/schemas';
import { database } from '../database/connection';
import { User, UserProfile } from '../types';

// Mock the database connection
jest.mock('../database/connection');

describe('UserService', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let schemas: DatabaseSchemas;
  let userService: UserService;

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

    userService = new UserService();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await schemas.getUsersCollection().deleteMany({});
  });

  describe('createUser', () => {
    const validUserData: Partial<User> = {
      telegramId: 'test123',
      profile: {
        name: 'John Doe',
        age: 25,
        height: 175,
        weight: 70,
        bmi: 22.9,
        fitnessGoal: 'bulk',
        trainingPhilosophy: 'arnold',
        experienceLevel: 'intermediate',
      },
      schedule: {
        workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        availableHours: [{ start: '06:00', end: '08:00' }],
        preferredWorkoutDuration: 60,
        workoutDaysPerWeek: 4,
      },
      preferences: {
        reminderFrequency: 'daily',
        humorEnabled: true,
        conversationStyle: 'casual',
      },
    };

    it('should create a user successfully', async () => {
      const result = await userService.createUser(validUserData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.profile.name).toBe('John Doe');
      expect(result.data?.telegramId).toBe('test123');
      expect(result.metadata?.bmiCategory).toBe('Normal weight');
    });

    it('should calculate BMI automatically', async () => {
      const userDataWithoutBMI = {
        ...validUserData,
        profile: {
          ...validUserData.profile!,
          bmi: undefined as any,
        },
      };

      const result = await userService.createUser(userDataWithoutBMI);

      expect(result.success).toBe(true);
      expect(result.data?.profile.bmi).toBe(22.9);
    });

    it('should set default values for missing optional fields', async () => {
      const minimalUserData = {
        profile: validUserData.profile,
      };

      const result = await userService.createUser(minimalUserData);

      expect(result.success).toBe(true);
      expect(result.data?.schedule.workoutDaysPerWeek).toBe(3);
      expect(result.data?.preferences.humorEnabled).toBe(true);
    });

    it('should reject invalid profile data', async () => {
      const invalidUserData = {
        ...validUserData,
        profile: {
          ...validUserData.profile!,
          age: 12, // Invalid age
        },
      };

      const result = await userService.createUser(invalidUserData);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
      expect(result.error?.message).toContain('Profile validation failed');
    });

    it('should reject duplicate telegram ID', async () => {
      // Create first user
      await userService.createUser(validUserData);

      // Try to create second user with same telegram ID
      const duplicateUser = {
        ...validUserData,
        profile: {
          ...validUserData.profile!,
          name: 'Jane Doe',
        },
      };

      const result = await userService.createUser(duplicateUser);

      expect(result.success).toBe(false);
    });
  });

  describe('getUserById', () => {
    let createdUserId: string;

    beforeEach(async () => {
      const result = await userService.createUser({
        telegramId: 'test456',
        profile: {
          name: 'Jane Doe',
          age: 30,
          height: 165,
          weight: 60,
          bmi: 22.0,
          fitnessGoal: 'lean',
          trainingPhilosophy: 'mentzer',
          experienceLevel: 'beginner',
        },
      });
      createdUserId = result.data!._id!.toString();
    });

    it('should retrieve user by valid ID', async () => {
      const result = await userService.getUserById(createdUserId);

      expect(result.success).toBe(true);
      expect(result.data?.profile.name).toBe('Jane Doe');
      expect(result.metadata?.bmiCategory).toBe('Normal weight');
      expect(result.metadata?.profileCompleteness).toBeGreaterThan(0);
    });

    it('should return error for invalid ID format', async () => {
      const result = await userService.getUserById('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
    });

    it('should return error for non-existent user', async () => {
      const result = await userService.getUserById('507f1f77bcf86cd799439011');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
    });
  });

  describe('getUserByTelegramId', () => {
    beforeEach(async () => {
      await userService.createUser({
        telegramId: 'telegram789',
        profile: {
          name: 'Bob Smith',
          age: 28,
          height: 180,
          weight: 80,
          bmi: 24.7,
          fitnessGoal: 'maintain',
          trainingPhilosophy: 'custom',
          experienceLevel: 'advanced',
        },
      });
    });

    it('should retrieve user by telegram ID', async () => {
      const result = await userService.getUserByTelegramId('telegram789');

      expect(result.success).toBe(true);
      expect(result.data?.profile.name).toBe('Bob Smith');
      expect(result.data?.telegramId).toBe('telegram789');
    });

    it('should return error for non-existent telegram ID', async () => {
      const result = await userService.getUserByTelegramId('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('updateUserProfile', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.createUser({
        telegramId: 'update123',
        profile: {
          name: 'Update Test',
          age: 25,
          height: 175,
          weight: 70,
          bmi: 22.9,
          fitnessGoal: 'bulk',
          trainingPhilosophy: 'arnold',
          experienceLevel: 'intermediate',
        },
      });
      userId = result.data!._id!.toString();
    });

    it('should update profile successfully', async () => {
      const updates: Partial<UserProfile> = {
        weight: 75,
        fitnessGoal: 'lean',
      };

      const result = await userService.updateUserProfile(userId, updates);

      expect(result.success).toBe(true);
      expect(result.data?.profile.weight).toBe(75);
      expect(result.data?.profile.fitnessGoal).toBe('lean');
      expect(result.data?.profile.bmi).toBe(24.5); // Recalculated BMI
      expect(result.metadata?.bmiChanged).toBe(true);
    });

    it('should recalculate BMI when height or weight changes', async () => {
      const updates = { height: 180 };

      const result = await userService.updateUserProfile(userId, updates);

      expect(result.success).toBe(true);
      expect(result.data?.profile.height).toBe(180);
      expect(result.data?.profile.bmi).toBe(21.6); // New BMI
    });

    it('should reject invalid updates', async () => {
      const invalidUpdates = { age: 150 };

      const result = await userService.updateUserProfile(userId, invalidUpdates);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Profile validation failed');
    });
  });

  describe('setFitnessGoal', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.createUser({
        telegramId: 'goal123',
        profile: {
          name: 'Goal Test',
          age: 25,
          height: 175,
          weight: 70,
          bmi: 22.9,
          fitnessGoal: 'maintain',
          trainingPhilosophy: 'arnold',
          experienceLevel: 'intermediate',
        },
      });
      userId = result.data!._id!.toString();
    });

    it('should set fitness goal and provide recommendations', async () => {
      const result = await userService.setFitnessGoal(userId, 'bulk');

      expect(result.success).toBe(true);
      expect(result.data?.profile.fitnessGoal).toBe('bulk');
      expect(result.metadata?.goalChanged).toBe(true);
      expect(result.metadata?.recommendations).toContain('Focus on compound movements');
    });

    it('should provide different recommendations for different goals', async () => {
      const leanResult = await userService.setFitnessGoal(userId, 'lean');
      
      expect(leanResult.success).toBe(true);
      expect(leanResult.metadata?.recommendations).toContain('Focus on higher rep ranges');
    });
  });

  describe('setTrainingPhilosophy', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.createUser({
        telegramId: 'philosophy123',
        profile: {
          name: 'Philosophy Test',
          age: 25,
          height: 175,
          weight: 70,
          bmi: 22.9,
          fitnessGoal: 'bulk',
          trainingPhilosophy: 'arnold',
          experienceLevel: 'intermediate',
        },
      });
      userId = result.data!._id!.toString();
    });

    it('should set training philosophy with description', async () => {
      const result = await userService.setTrainingPhilosophy(userId, 'mentzer');

      expect(result.success).toBe(true);
      expect(result.data?.profile.trainingPhilosophy).toBe('mentzer');
      expect(result.metadata?.philosophyChanged).toBe(true);
      expect(result.metadata?.philosophyDescription).toContain('High-intensity, low-volume');
    });
  });

  describe('deleteUser', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.createUser({
        telegramId: 'delete123',
        profile: {
          name: 'Delete Test',
          age: 25,
          height: 175,
          weight: 70,
          bmi: 22.9,
          fitnessGoal: 'bulk',
          trainingPhilosophy: 'arnold',
          experienceLevel: 'intermediate',
        },
      });
      userId = result.data!._id!.toString();
    });

    it('should delete user successfully', async () => {
      const result = await userService.deleteUser(userId);

      expect(result.success).toBe(true);
      expect(result.metadata?.deletedAt).toBeDefined();

      // Verify user is actually deleted
      const getResult = await userService.getUserById(userId);
      expect(getResult.success).toBe(false);
    });

    it('should return error for non-existent user', async () => {
      const result = await userService.deleteUser('507f1f77bcf86cd799439011');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('Error');
    });
  });
});