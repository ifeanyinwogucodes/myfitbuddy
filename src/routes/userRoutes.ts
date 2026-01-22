import { Router, Request, Response } from 'express';
import { UserService } from '../services/UserService';

const router = Router();
const userService = new UserService();

/**
 * POST /api/users - Create a new user
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = await userService.createUser(req.body);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in POST /users:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Something went wrong. Please try again.',
      },
    });
  }
});

/**
 * GET /api/users/:userId - Get user by ID
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await userService.getUserById(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in GET /users/:userId:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to retrieve user profile.',
      },
    });
  }
});

/**
 * GET /api/users/telegram/:telegramId - Get user by Telegram ID
 */
router.get('/telegram/:telegramId', async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.params;
    const result = await userService.getUserByTelegramId(telegramId);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in GET /users/telegram/:telegramId:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to retrieve user profile.',
      },
    });
  }
});

/**
 * PUT /api/users/:userId/profile - Update user profile
 */
router.put('/:userId/profile', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await userService.updateUserProfile(userId, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/profile:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to update profile.',
      },
    });
  }
});

/**
 * PUT /api/users/:userId/schedule - Update user schedule
 */
router.put('/:userId/schedule', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await userService.updateUserSchedule(userId, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/schedule:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to update schedule.',
      },
    });
  }
});

/**
 * PUT /api/users/:userId/preferences - Update user preferences
 */
router.put('/:userId/preferences', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await userService.updateUserPreferences(userId, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/preferences:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to update preferences.',
      },
    });
  }
});

/**
 * PUT /api/users/:userId/goal - Set fitness goal
 */
router.put('/:userId/goal', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { goal } = req.body;
    
    if (!goal || !['lean', 'bulk', 'maintain'].includes(goal)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_GOAL',
          message: 'Invalid fitness goal',
          userMessage: 'Please select a valid fitness goal: lean, bulk, or maintain.',
        },
      });
    }
    
    const result = await userService.setFitnessGoal(userId, goal);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/goal:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to update fitness goal.',
      },
    });
  }
});

/**
 * PUT /api/users/:userId/philosophy - Set training philosophy
 */
router.put('/:userId/philosophy', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { philosophy } = req.body;
    
    if (!philosophy || !['mentzer', 'arnold', 'custom'].includes(philosophy)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHILOSOPHY',
          message: 'Invalid training philosophy',
          userMessage: 'Please select a valid training philosophy: mentzer, arnold, or custom.',
        },
      });
    }
    
    const result = await userService.setTrainingPhilosophy(userId, philosophy);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/philosophy:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to update training philosophy.',
      },
    });
  }
});

/**
 * DELETE /api/users/:userId - Delete user account
 */
router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await userService.deleteUser(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in DELETE /users/:userId:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        userMessage: 'Failed to delete user account.',
      },
    });
  }
});

export default router;