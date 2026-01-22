# Fit Buddy - AI-Powered Fitness Companion

A conversational AI-powered fitness companion designed specifically for Nigerian users, providing personalized workout planning, nutrition tracking, gym location services, and intelligent coaching.

## Features

- 🤖 **Conversational AI**: Natural language interactions for all fitness activities
- 💪 **Personalized Workouts**: Custom plans based on your schedule and training philosophy
- 🍽️ **Nigerian Nutrition**: Culturally relevant meal plans with local ingredients
- 📍 **Gym Finder**: Location-based gym recommendations with quality tiers
- 📊 **Progress Tracking**: Evidence-based PR suggestions and performance analysis
- 📱 **Telegram Integration**: Seamless bot interface for mobile interactions

## Tech Stack

- **Backend**: Node.js with TypeScript and Express.js
- **Database**: MongoDB Atlas
- **AI/LLM**: OpenRouter API
- **Bot Interface**: Telegram Bot API
- **Testing**: Jest with TypeScript support

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB Atlas account (connection string provided)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd fit-buddy
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration (API keys are pre-configured)
```

4. Build the project:
```bash
npm run build
```

5. Start the development server:
```bash
npm run dev
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript project
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /api` - API information and available endpoints

## Project Structure

```
src/
├── config/           # Configuration and environment variables
├── database/         # Database connection and utilities
├── middleware/       # Express middleware functions
├── __tests__/        # Test files
├── app.ts           # Express application setup
└── index.ts         # Application entry point
```

## Development

The project follows a microservices architecture with the following planned services:

- **Conversational AI Service**: Central orchestrator for all interactions
- **User Service**: Profile management and preferences
- **Workout Service**: Exercise planning and session tracking
- **Nutrition Service**: Meal planning and calorie tracking
- **Gym Service**: Location-based gym recommendations
- **Image Analysis Service**: Food image recognition and analysis

## Environment Variables

Required environment variables (see `.env.example`):

- `MONGODB_URI` - MongoDB Atlas connection string
- `OPENROUTER_API_KEY` - OpenRouter API key for LLM services
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` - Secret key for JWT tokens

## Contributing

1. Follow TypeScript best practices
2. Write tests for new features
3. Use conventional commit messages
4. Ensure all tests pass before submitting PRs

## License

This project is licensed under the MIT License.