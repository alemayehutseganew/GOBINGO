class MockTelebirrService {
  constructor(backendUrl = process.env.BACKEND_URL || 'http://localhost:3001') {
    this.backendUrl = backendUrl;
  }

  async createMockOrder(data) {
    const tradeNo = data.outTradeNo || `GOBINGO_TEST_${Date.now()}`;
    return {
      code: 0,
      msg: 'success',
      data: {
        toUrl: `${this.backendUrl}/api/telebirr/mock/checkout?outTradeNo=${tradeNo}&amount=${data.amount}&userId=${data.userId}`,
        outTradeNo: tradeNo,
      },
    };
  }

  async triggerMockWebhook(outTradeNo, amount, userId) {
    try {
      const response = await fetch(`${this.backendUrl}/api/telebirr/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outTradeNo,
          totalAmount: amount,
          tradeStatus: 'COMPLETED',
          userId,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.statusText);
      return data;
    } catch (error) {
      console.error('Mock Telebirr webhook trigger failed:', error);
      throw error;
    }
  }
}

module.exports = MockTelebirrService;