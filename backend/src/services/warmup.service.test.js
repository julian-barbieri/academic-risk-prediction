jest.mock('axios');
const axios = require('axios');
const { pingAiService } = require('./warmup.service');

describe('pingAiService', () => {
  const ORIGINAL_ENV = process.env.AI_SERVICE_URL;

  afterEach(() => {
    jest.clearAllMocks();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.AI_SERVICE_URL;
    } else {
      process.env.AI_SERVICE_URL = ORIGINAL_ENV;
    }
  });

  test('llama a {AI_SERVICE_URL}/health con timeout de 60s', async () => {
    process.env.AI_SERVICE_URL = 'https://pf-ai.onrender.com';
    axios.get.mockResolvedValue({ data: { status: 'ok' } });

    await pingAiService();

    expect(axios.get).toHaveBeenCalledWith(
      'https://pf-ai.onrender.com/health',
      { timeout: 60000 },
    );
  });

  test('usa http://localhost:8000 como fallback si AI_SERVICE_URL no esta seteada', async () => {
    delete process.env.AI_SERVICE_URL;
    axios.get.mockResolvedValue({ data: { status: 'ok' } });

    await pingAiService();

    expect(axios.get).toHaveBeenCalledWith(
      'http://localhost:8000/health',
      { timeout: 60000 },
    );
  });

  test('no lanza excepcion si axios.get falla', async () => {
    process.env.AI_SERVICE_URL = 'https://pf-ai.onrender.com';
    axios.get.mockRejectedValue(new Error('timeout'));

    await expect(pingAiService()).resolves.toBeUndefined();
  });
});
