import {
  calculateBMI,
  calculateDailyCalories,
  validateUserProfile,
  validateUserSchedule,
  validateUserPreferences,
  validateNigerianPhoneNumber,
  validateNigerianState,
  sanitizeString,
  sanitizeNumber,
} from '../utils/validation';
import { UserProfile, UserSchedule, UserPreferences } from '../types';

describe('Validation Utils', () => {
  describe('calculateBMI', () => {
    it('should calculate BMI correctly', () => {
      expect(calculateBMI(70, 175)).toBe(22.9);
      expect(calculateBMI(80, 180)).toBe(24.7);
      expect(calculateBMI(60, 160)).toBe(23.4);
    });
  });

  describe('calculateDailyCalories', () => {
    it('should calculate calories for male bulk goal', () => {
      const calories = calculateDailyCalories(75, 180, 25, 'male', 'moderate', 'bulk');
      expect(calories).toBeGreaterThan(2000);
      expect(calories).toBeLessThan(4000);
    });

    it('should calculate calories for female lean goal', () => {
      const calories = calculateDailyCalories(60, 165, 30, 'female', 'light', 'lean');
      expect(calories).toBeGreaterThan(1200);
      expect(calories).toBeLessThan(2500);
    });

    it('should return different values for different goals', () => {
      const maintain = calculateDailyCalories(70, 175, 25, 'male', 'moderate', 'maintain');
      const bulk = calculateDailyCalories(70, 175, 25, 'male', 'moderate', 'bulk');
      const lean = calculateDailyCalories(70, 175, 25, 'male', 'moderate', 'lean');

      expect(bulk).toBeGreaterThan(maintain);
      expect(maintain).toBeGreaterThan(lean);
    });
  });

  describe('validateUserProfile', () => {
    const validProfile: UserProfile = {
      name: 'John Doe',
      age: 25,
      height: 175,
      weight: 70,
      bmi: 22.9,
      fitnessGoal: 'bulk',
      trainingPhilosophy: 'arnold',
      experienceLevel: 'intermediate',
    };

    it('should validate a correct user profile', () => {
      const result = validateUserProfile(validProfile);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validProfile);
    });

    it('should reject invalid age', () => {
      const invalidProfile = { ...validProfile, age: 12 };
      const result = validateUserProfile(invalidProfile);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid fitness goal', () => {
      const invalidProfile = { ...validProfile, fitnessGoal: 'invalid' as any };
      const result = validateUserProfile(invalidProfile);
      expect(result.error).toBeDefined();
    });

    it('should reject missing required fields', () => {
      const invalidProfile = { ...validProfile };
      delete (invalidProfile as any).name;
      const result = validateUserProfile(invalidProfile);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateUserSchedule', () => {
    const validSchedule: UserSchedule = {
      workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      availableHours: [
        { start: '06:00', end: '08:00' },
        { start: '18:00', end: '21:00' },
      ],
      preferredWorkoutDuration: 60,
      workoutDaysPerWeek: 4,
    };

    it('should validate a correct user schedule', () => {
      const result = validateUserSchedule(validSchedule);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validSchedule);
    });

    it('should reject invalid time format', () => {
      const invalidSchedule = {
        ...validSchedule,
        availableHours: [{ start: '25:00', end: '08:00' }],
      };
      const result = validateUserSchedule(invalidSchedule);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid workout duration', () => {
      const invalidSchedule = { ...validSchedule, preferredWorkoutDuration: 200 };
      const result = validateUserSchedule(invalidSchedule);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateUserPreferences', () => {
    const validPreferences: UserPreferences = {
      reminderFrequency: 'daily',
      humorEnabled: true,
      conversationStyle: 'casual',
    };

    it('should validate correct user preferences', () => {
      const result = validateUserPreferences(validPreferences);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validPreferences);
    });

    it('should reject invalid conversation style', () => {
      const invalidPreferences = { ...validPreferences, conversationStyle: 'invalid' as any };
      const result = validateUserPreferences(invalidPreferences);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateNigerianPhoneNumber', () => {
    it('should validate correct Nigerian phone numbers', () => {
      expect(validateNigerianPhoneNumber('+2348012345678')).toBe(true);
      expect(validateNigerianPhoneNumber('2348012345678')).toBe(true);
      expect(validateNigerianPhoneNumber('08012345678')).toBe(true);
      expect(validateNigerianPhoneNumber('07012345678')).toBe(true);
      expect(validateNigerianPhoneNumber('09012345678')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validateNigerianPhoneNumber('1234567890')).toBe(false);
      expect(validateNigerianPhoneNumber('+1234567890')).toBe(false);
      expect(validateNigerianPhoneNumber('08012345')).toBe(false);
    });
  });

  describe('validateNigerianState', () => {
    it('should validate correct Nigerian states', () => {
      expect(validateNigerianState('Lagos')).toBe(true);
      expect(validateNigerianState('FCT')).toBe(true);
      expect(validateNigerianState('Kano')).toBe(true);
    });

    it('should reject invalid states', () => {
      expect(validateNigerianState('California')).toBe(false);
      expect(validateNigerianState('Invalid State')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('  <script>alert("xss")</script>  ')).toBe('scriptalert("xss")/script');
      expect(sanitizeString('Normal text')).toBe('Normal text');
      expect(sanitizeString('  Trimmed  ')).toBe('Trimmed');
    });
  });

  describe('sanitizeNumber', () => {
    it('should parse valid numbers', () => {
      expect(sanitizeNumber('123')).toBe(123);
      expect(sanitizeNumber('123.45')).toBe(123.45);
      expect(sanitizeNumber(456)).toBe(456);
    });

    it('should return null for invalid numbers', () => {
      expect(sanitizeNumber('abc')).toBe(null);
      expect(sanitizeNumber('')).toBe(null);
      expect(sanitizeNumber(null)).toBe(null);
    });
  });
});