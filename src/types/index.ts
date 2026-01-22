import { ObjectId } from 'mongodb';

// Core user types
export interface User {
  _id?: ObjectId;
  telegramId?: string;
  profile: UserProfile;
  schedule: UserSchedule;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  name: string;
  age: number;
  height: number; // in cm
  weight: number; // in kg
  bmi: number;
  fitnessGoal: 'lean' | 'bulk' | 'maintain';
  trainingPhilosophy: 'mentzer' | 'arnold' | 'custom';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

export interface UserSchedule {
  workDays: string[];
  availableHours: TimeSlot[];
  preferredWorkoutDuration: number; // in minutes
  workoutDaysPerWeek: number;
}

export interface TimeSlot {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface UserPreferences {
  reminderFrequency: string;
  humorEnabled: boolean;
  conversationStyle: 'casual' | 'professional' | 'motivational';
}

// Workout types
export interface WorkoutPlan {
  _id?: ObjectId;
  userId: ObjectId;
  planType: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'body_part_split';
  schedule: WorkoutDay[];
  philosophy: 'mentzer' | 'arnold' | 'custom';
  createdAt: Date;
  isActive: boolean;
}

export interface WorkoutDay {
  dayOfWeek: string;
  muscleGroups: string[];
  exercises: PlannedExercise[];
  estimatedDuration: number;
}

export interface PlannedExercise {
  exerciseId: ObjectId;
  sets: number;
  reps: string; // e.g., "8-12", "to failure"
  restTime: number; // in seconds
  notes?: string;
}

export interface WorkoutSession {
  _id?: ObjectId;
  userId: ObjectId;
  plannedWorkout?: ObjectId;
  startTime: Date;
  endTime?: Date;
  exercises: ExerciseLog[];
  notes?: string;
  isCompleted: boolean;
}

export interface ExerciseLog {
  exerciseId: ObjectId;
  sets: SetLog[];
  notes?: string;
}

export interface SetLog {
  reps: number;
  weight?: number;
  rpe?: number; // Rate of Perceived Exertion (1-10)
  restTime?: number;
}

export interface Exercise {
  _id?: ObjectId;
  name: string;
  localNames: string[]; // Nigerian/local names
  category: string;
  muscleGroups: string[];
  equipment: string[];
  instructions: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  videoUrl?: string;
  imageUrl?: string;
}

// Nutrition types
export interface MealPlan {
  _id?: ObjectId;
  userId: ObjectId;
  dailyCalories: number;
  macroTargets: MacroTargets;
  meals: Meal[];
  culturalPreferences: string[];
  budgetTier: 'low' | 'medium' | 'high';
  createdAt: Date;
  isActive: boolean;
}

export interface MacroTargets {
  protein: number; // in grams
  carbs: number;   // in grams
  fats: number;    // in grams
}

export interface Meal {
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: MealFood[];
  totalCalories: number;
  macros: MacroTargets;
  preparationTime: number; // in minutes
  cost: number; // estimated cost in Naira
}

export interface MealFood {
  foodId: ObjectId;
  quantity: number; // in grams
  calories: number;
  macros: MacroTargets;
}

export interface FoodItem {
  _id?: ObjectId;
  name: string;
  localNames: string[];
  caloriesPerGram: number;
  macros: MacroTargets; // per 100g
  availability: 'common' | 'seasonal' | 'rare';
  averagePrice: number; // per kg in Naira
  category: string;
}

export interface FoodLog {
  _id?: ObjectId;
  userId: ObjectId;
  timestamp: Date;
  items: LoggedFood[];
  imageUrl?: string;
  analysisConfidence?: number;
  totalCalories: number;
  totalMacros: MacroTargets;
}

export interface LoggedFood {
  foodId: ObjectId;
  quantity: number;
  calories: number;
  macros: MacroTargets;
}

// Gym types
export interface Gym {
  _id?: ObjectId;
  name: string;
  location: GymLocation;
  qualityTier: 'local' | 'medium' | 'standard' | 'ultra_standard';
  amenities: string[];
  operatingHours: OperatingHours;
  contact: GymContact;
  ratings: GymRatings;
  submittedBy?: ObjectId;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: Date;
}

export interface GymLocation {
  address: string;
  coordinates: [number, number]; // [longitude, latitude]
  city: string;
  state: string;
  landmark?: string;
}

export interface OperatingHours {
  [day: string]: { open: string; close: string } | null;
}

export interface GymContact {
  phone?: string;
  email?: string;
  website?: string;
}

export interface GymRatings {
  overall: number;
  equipment: number;
  cleanliness: number;
  staff: number;
  reviewCount: number;
}

// Conversation types
export interface Conversation {
  _id?: ObjectId;
  userId: ObjectId;
  messages: Message[];
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface ConversationContext {
  currentActivity?: 'onboarding' | 'workout' | 'meal_planning' | 'gym_search';
  sessionData?: any;
  userPreferences?: UserPreferences;
  lastInteraction?: Date;
}

// Progress tracking types
export interface UserProgress {
  _id?: ObjectId;
  userId: ObjectId;
  date: Date;
  weight?: number;
  bodyFat?: number;
  measurements?: BodyMeasurements;
  photos?: string[];
  notes?: string;
}

export interface BodyMeasurements {
  chest?: number;
  waist?: number;
  hips?: number;
  bicep?: number;
  thigh?: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    userMessage?: string;
    retryable?: boolean;
  };
  metadata?: any;
}