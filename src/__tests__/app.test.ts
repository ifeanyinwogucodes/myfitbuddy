import request from 'supertest';
import App from '../app';

describe('App', () => {
  let app: App;

  beforeAll(() => {
    app = new App();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app.app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Fit Buddy API is running',
        environment: expect.any(String),
      });
    });
  });

  describe('GET /api', () => {
    it('should return API information', async () => {
      const response = await request(app.app)
        .get('/api')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Fit Buddy API v1.0',
        endpoints: expect.any(Object),
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app.app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: expect.stringContaining('Route GET /unknown-route not found'),
        },
      });
    });
  });
});