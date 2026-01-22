import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import App from '../app';
import { database } from '../database/connection';

// Mock the database connection
jest.mock('../database/connection');

describe('User Routes', () => {
  let app: App;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    
    // Mock database connection
    (database.connect as jest.Mock).mockResolvedValue(client.db('test'));
    (database.isConnected as jest.Mock).mockReturnValue(true);
    (database.getSchemas as jest.Mock).mockReturnValue({
      getUsersCollection: () => client.db('test').collection('users'),
    });

    app = new App();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await client.db('test').collection('users').deleteMany({});
  });

  describe('POST /api/users', () => {
    const validUserData = {
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
      const response = await request(app.app)
        .post('/api/users')
        .send(validUserData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.name).toBe('John Doe');
      expect(response.body.metadata.bmiCategory).toBe('Normal weight');
    });

    it('should return 400 for invalid user data', async () => {
      const invalidData = {
        ...validUserData,
        profile: {
          ...validUserData.profile,
          age: 12, // Invalid age
        },
      };

      const response = await request(app.app)
        .post('/api/users')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Profile validation failed');
    });

    it('should return 400 for missing profile', async () => {
      const response = await request(app.app)
        .post('/api/users')
        .send({ telegramId: 'test' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('User profile is required');
    });
  });

  describe('GET /api/users/:userId', () => {
    let userId: string;

    beforeEach(async () => {
      const createResponse = await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'gettest123',
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
      userId = createResponse.body.data._id;
    });

    it('should get user by ID successfully', async () => {
      const response = await request(app.app)
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.name).toBe('Jane Doe');
      expect(response.body.metadata.profileCompleteness).toBeGreaterThan(0);
    });

    it('should return 400 for invalid user ID format', async () => {
      const response = await request(app.app)
        .get('/api/users/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.app)
        .get('/api/users/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/users/telegram/:telegramId', () => {
    beforeEach(async () => {
      await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'telegram123',
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

    it('should get user by telegram ID successfully', async () => {
      const response = await request(app.app)
        .get('/api/users/telegram/telegram123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.name).toBe('Bob Smith');
      expect(response.body.data.telegramId).toBe('telegram123');
    });

    it('should return 404 for non-existent telegram ID', async () => {
      const response = await request(app.app)
        .get('/api/users/telegram/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PUT /api/users/:userId/profile', () => {
    let userId: string;

    beforeEach(async () => {
      const createResponse = await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'updatetest123',
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
      userId = createResponse.body.data._id;
    });

    it('should update profile successfully', async () => {
      const updates = {
        weight: 75,
        fitnessGoal: 'lean',
      };

      const response = await request(app.app)
        .put(`/api/users/${userId}/profile`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.weight).toBe(75);
      expect(response.body.data.profile.fitnessGoal).toBe('lean');
      expect(response.body.metadata.bmiChanged).toBe(true);
    });

    it('should return 400 for invalid updates', async () => {
      const invalidUpdates = { age: 150 };

      const response = await request(app.app)
        .put(`/api/users/${userId}/profile`)
        .send(invalidUpdates)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/users/:userId/goal', () => {
    let userId: string;

    beforeEach(async () => {
      const createResponse = await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'goaltest123',
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
      userId = createResponse.body.data._id;
    });

    it('should set fitness goal successfully', async () => {
      const response = await request(app.app)
        .put(`/api/users/${userId}/goal`)
        .send({ goal: 'bulk' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.fitnessGoal).toBe('bulk');
      expect(response.body.metadata.goalChanged).toBe(true);
      expect(response.body.metadata.recommendations).toContain('Focus on compound movements');
    });

    it('should return 400 for invalid goal', async () => {
      const response = await request(app.app)
        .put(`/api/users/${userId}/goal`)
        .send({ goal: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_GOAL');
    });

    it('should return 400 for missing goal', async () => {
      const response = await request(app.app)
        .put(`/api/users/${userId}/goal`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_GOAL');
    });
  });

  describe('PUT /api/users/:userId/philosophy', () => {
    let userId: string;

    beforeEach(async () => {
      const createResponse = await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'philosophytest123',
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
      userId = createResponse.body.data._id;
    });

    it('should set training philosophy successfully', async () => {
      const response = await request(app.app)
        .put(`/api/users/${userId}/philosophy`)
        .send({ philosophy: 'mentzer' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.trainingPhilosophy).toBe('mentzer');
      expect(response.body.metadata.philosophyChanged).toBe(true);
      expect(response.body.metadata.philosophyDescription).toContain('High-intensity, low-volume');
    });

    it('should return 400 for invalid philosophy', async () => {
      const response = await request(app.app)
        .put(`/api/users/${userId}/philosophy`)
        .send({ philosophy: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PHILOSOPHY');
    });
  });

  describe('DELETE /api/users/:userId', () => {
    let userId: string;

    beforeEach(async () => {
      const createResponse = await request(app.app)
        .post('/api/users')
        .send({
          telegramId: 'deletetest123',
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
      userId = createResponse.body.data._id;
    });

    it('should delete user successfully', async () => {
      const response = await request(app.app)
        .delete(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.metadata.deletedAt).toBeDefined();

      // Verify user is deleted
      await request(app.app)
        .get(`/api/users/${userId}`)
        .expect(404);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.app)
        .delete('/api/users/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});