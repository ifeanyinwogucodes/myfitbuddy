import Joi from 'joi';
import { UserProfile, UserSchedule, UserPreferences } from '../types';

// BMI calculation utility
export const calculateBMI = (weight: number, height: number): number => {
  // height in cm, weight in kg
  const heightInMeters = height / 100;
  return Math.round((weight / (heightInMeters * heightInMeters)) * 10) / 10;
};

// Calorie calculation based on BMI and goals
export const calculateDailyCalories = (
  weight: number, 
  height: number, 
  age: number, 
  gender: 'male' | 'female', 
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active',
  goal: 'lean' | 'bulk' | 'maintain'
): number => {
  // Mifflin-St Jeor Equation
  let bmr: number;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };

  const tdee = bmr * activityMultipliers[activityLevel];

  // Goal adjustments
  switch (goal) {
    case 'lean':
      return Math.round(tdee * 0.8); // 20% deficit
    case 'bulk':
      return Math.round(tdee * 1.15); // 15% surplus
    case 'maintain':
    default:
      return Math.round(tdee);
  }
};

// Validation schemas
export const userProfileSchema = Joi.object<UserProfile>({
  name: Joi.string().min(1).max(100).required(),
  age: Joi.number().integer().min(13).max(100).required(),
  height: Joi.number().min(100).max(250).required(),
  weight: Joi.number().min(30).max(300).required(),
  bmi: Joi.number().min(10).max(50).required(),
  fitnessGoal: Joi.string().valid('lean', 'bulk', 'maintain').required(),
  trainingPhilosophy: Joi.string().valid('mentzer', 'arnold', 'custom').required(),
  experienceLevel: Joi.string().valid('beginner', 'intermediate', 'advanced').required(),
});

export const userScheduleSchema = Joi.object<UserSchedule>({
  workDays: Joi.array().items(Joi.string()).min(0).max(7).required(),
  availableHours: Joi.array().items(
    Joi.object({
      start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    })
  ).required(),
  preferredWorkoutDuration: Joi.number().integer().min(15).max(180).required(),
  workoutDaysPerWeek: Joi.number().integer().min(1).max(7).required(),
});

export const userPreferencesSchema = Joi.object<UserPreferences>({
  reminderFrequency: Joi.string().required(),
  humorEnabled: Joi.boolean().required(),
  conversationStyle: Joi.string().valid('casual', 'professional', 'motivational').required(),
});

export const gymLocationSchema = Joi.object({
  address: Joi.string().min(1).required(),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  city: Joi.string().min(1).required(),
  state: Joi.string().min(1).required(),
  landmark: Joi.string().optional(),
});

// Validation helper functions
export const validateUserProfile = (profile: UserProfile): { error?: string; value?: UserProfile } => {
  const { error, value } = userProfileSchema.validate(profile);
  if (error) {
    return { error: error.details[0].message };
  }
  return { value };
};

export const validateUserSchedule = (schedule: UserSchedule): { error?: string; value?: UserSchedule } => {
  const { error, value } = userScheduleSchema.validate(schedule);
  if (error) {
    return { error: error.details[0].message };
  }
  return { value };
};

export const validateUserPreferences = (preferences: UserPreferences): { error?: string; value?: UserPreferences } => {
  const { error, value } = userPreferencesSchema.validate(preferences);
  if (error) {
    return { error: error.details[0].message };
  }
  return { value };
};

// Nigerian-specific validation helpers
export const validateNigerianPhoneNumber = (phone: string): boolean => {
  // Nigerian phone number patterns
  const patterns = [
    /^(\+234|234|0)[789][01]\d{8}$/, // MTN, Airtel, Glo, 9mobile
  ];
  return patterns.some(pattern => pattern.test(phone));
};

export const validateNigerianState = (state: string): boolean => {
  const nigerianStates = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
    'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
    'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
    'Yobe', 'Zamfara'
  ];
  return nigerianStates.includes(state);
};

// Data sanitization helpers
export const sanitizeString = (str: string): string => {
  return str.trim().replace(/[<>]/g, '');
};

export const sanitizeNumber = (num: any): number | null => {
  const parsed = parseFloat(num);
  return isNaN(parsed) ? null : parsed;
};