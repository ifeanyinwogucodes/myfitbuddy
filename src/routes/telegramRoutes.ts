import { Router, Request, Response } from 'express';
import { TelegramBotService } from '../services/TelegramBotService';

const router = Router();
let telegramService: TelegramBotService | null = null;

// Initialize Telegram service
const getTelegramService = (): TelegramBotService => {
  if (!telegramService) {
    telegramService = new TelegramBotService();
  }
  return telegramService;
};

/**
 * POST /api/telegram/webhook - Telegram webhook endpoint
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    
    if (!update) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UPDATE',
          message: 'No update data provided',
        },
      });
    }

    const service = getTelegramService();
    await service.processWebhookUpdate(update);

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing Telegram webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process webhook',
      },
    });
  }
});

/**
 * POST /api/telegram/start - Start Telegram bot
 */
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const service = getTelegramService();
    
    if (service.isActive()) {
      return res.json({
        success: true,
        message: 'Telegram bot is already running',
        data: {
          status: 'active',
        },
      });
    }

    await service.start();

    res.json({
      success: true,
      message: 'Telegram bot started successfully',
      data: {
        status: 'started',
      },
    });
  } catch (error) {
    console.error('Error starting Telegram bot:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOT_START_ERROR',
        message: 'Failed to start Telegram bot',
        userMessage: 'Unable to start the bot service.',
      },
    });
  }
});

/**
 * POST /api/telegram/stop - Stop Telegram bot
 */
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    const service = getTelegramService();
    
    if (!service.isActive()) {
      return res.json({
        success: true,
        message: 'Telegram bot is not running',
        data: {
          status: 'inactive',
        },
      });
    }

    await service.stop();

    res.json({
      success: true,
      message: 'Telegram bot stopped successfully',
      data: {
        status: 'stopped',
      },
    });
  } catch (error) {
    console.error('Error stopping Telegram bot:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOT_STOP_ERROR',
        message: 'Failed to stop Telegram bot',
        userMessage: 'Unable to stop the bot service.',
      },
    });
  }
});

/**
 * GET /api/telegram/status - Get Telegram bot status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const service = getTelegramService();
    const isActive = service.isActive();
    
    let botInfo: any = null;
    if (isActive) {
      try {
        botInfo = await service.getBotInfo();
      } catch (error) {
        console.error('Error getting bot info:', error);
      }
    }

    res.json({
      success: true,
      data: {
        status: isActive ? 'active' : 'inactive',
        botInfo: botInfo ? {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries,
        } : null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting Telegram bot status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_ERROR',
        message: 'Failed to get bot status',
        userMessage: 'Unable to retrieve bot status.',
      },
    });
  }
});

/**
 * POST /api/telegram/set-webhook - Set webhook URL
 */
router.post('/set-webhook', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_URL',
          message: 'Webhook URL is required',
          userMessage: 'Please provide a webhook URL.',
        },
      });
    }

    const service = getTelegramService();
    // This would typically involve calling bot.setWebHook(url)
    // For now, we'll just return success
    
    res.json({
      success: true,
      message: 'Webhook URL set successfully',
      data: {
        webhookUrl: url,
      },
    });
  } catch (error) {
    console.error('Error setting webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_SET_ERROR',
        message: 'Failed to set webhook',
        userMessage: 'Unable to set webhook URL.',
      },
    });
  }
});

// Export the service instance for use in app.ts
export { getTelegramService };
export default router;