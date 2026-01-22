import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { DatabaseSchemas } from '../database/schemas';
import { User, Gym } from '../types';

describe('Database Schemas', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let schemas: DatabaseSchemas;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test');
    schemas = new DatabaseSchemas(db);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  });

  describe('Index Creation', () => {
    it('should create indexes without errors', async () => {
      await expect(schemas.createIndexes()).resolves.not.toThrow();
    });

    it('should create users collection indexes', async () => {
      await schemas.createIndexes();
      const usersCollection = schemas.getUsersCollection();
      const indexes = await usersCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(index => Object.keys(index.key)[0]);
      expect(indexNames).toContain('telegramId');
      expect(indexNames).toContain('profile.bmi');
    });

    it('should create gyms collection geospatial index', async () => {
      await schemas.createIndexes();
      const gymsCollection = schemas.getGymsCollection();
      const indexes = await gymsCollection.listIndexes().toArray();
      
      const geoIndex = indexes.find(index => index.key['location.coordinates']);
      expect(geoIndex).toBeDefined();
      expect(geoIndex?.key['location.coordinates']).toBe('2dsphere');
    });
  });

  describe('Collection Type Safety', () => {
    it('should provide type-safe collection access', () => {
      const usersCollection = schemas.getUsersCollection();
      const gymsCollection = schemas.getGymsCollection();
      const workoutPlansCollection = schemas.getWorkoutPlansCollection();

      expect(usersCollection).toBeDefined();
      expect(gymsCollection).toBeDefined();
      expect(workoutPlansCollection).toBeDefined();
    });
  });

  describe('Data Operations', () => {
    beforeEach(async () => {
      await schemas.createIndexes();
    });

    it('should insert and retrieve a user', async () => {
      const usersCollection = schemas.getUsersCollection();
      
      const testUser: User = {
        telegramId: 'test123',
        profile: {
          name: 'Test User',
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await usersCollection.insertOne(testUser);
      expect(result.insertedId).toBeDefined();

      const retrievedUser = await usersCollection.findOne({ telegramId: 'test123' });
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.profile.name).toBe('Test User');
    });

    it('should insert and query gyms by location', async () => {
      const gymsCollection = schemas.getGymsCollection();
      
      const testGym: Gym = {
        name: 'Test Gym Lagos',
        location: {
          address: '123 Test Street, Victoria Island',
          coordinates: [3.4219, 6.4474], // Lagos coordinates
          city: 'Lagos',
          state: 'Lagos',
        },
        qualityTier: 'standard',
        amenities: ['weights', 'cardio', 'shower'],
        operatingHours: {
          Monday: { open: '06:00', close: '22:00' },
          Tuesday: { open: '06:00', close: '22:00' },
        },
        contact: {
          phone: '+2348012345678',
        },
        ratings: {
          overall: 4.5,
          equipment: 4.0,
          cleanliness: 5.0,
          staff: 4.5,
          reviewCount: 10,
        },
        verificationStatus: 'verified',
        createdAt: new Date(),
      };

      const result = await gymsCollection.insertOne(testGym);
      expect(result.insertedId).toBeDefined();

      // Test geospatial query (find gyms near Lagos)
      const nearbyGyms = await gymsCollection.find({
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [3.4219, 6.4474],
            },
            $maxDistance: 10000, // 10km
          },
        },
      }).toArray();

      expect(nearbyGyms).toHaveLength(1);
      expect(nearbyGyms[0].name).toBe('Test Gym Lagos');
    });

    it('should enforce unique telegram ID constraint', async () => {
      const usersCollection = schemas.getUsersCollection();
      
      const user1: User = {
        telegramId: 'duplicate123',
        profile: {
          name: 'User 1',
          age: 25,
          height: 175,
          weight: 70,
          bmi: 22.9,
          fitnessGoal: 'bulk',
          trainingPhilosophy: 'arnold',
          experienceLevel: 'intermediate',
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

      const user2: User = { ...user1, profile: { ...user1.profile, name: 'User 2' } };

      await usersCollection.insertOne(user1);
      
      // Second insert should fail due to unique constraint
      await expect(usersCollection.insertOne(user2)).rejects.toThrow();
    });
  });
});