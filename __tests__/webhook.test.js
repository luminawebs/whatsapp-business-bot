const request = require('supertest');

describe('WhatsApp webhook endpoints', () => {
  let app;

  beforeAll(() => {
    // Ensure VERIFY_TOKEN is set before requiring the app so the module reads it correctly
    process.env.VERIFY_TOKEN = 'test_token';
    app = require('../server');
  });

  test('GET /webhook returns challenge when verify token matches', async () => {
    const res = await request(app)
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test_token', 'hub.challenge': 'CHALLENGE' });

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('CHALLENGE');
  });

  test('GET /webhook returns 403 when token does not match', async () => {
    const res = await request(app)
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'X' });

    expect(res.statusCode).toBe(403);
  });

  test('POST /webhook returns 200', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ hello: 'world' });

    expect(res.statusCode).toBe(200);
  });
});
