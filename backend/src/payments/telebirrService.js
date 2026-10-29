const MOCK_TELEBIRR = String(process.env.MOCK_TELEBIRR || '').trim().toLowerCase() === 'true';

let Telebirr = null;
let PaymentStatus = null;
let telebirrClient = null;
let isSdkAvailable = false;

try {
  const sdk = require('@telebirr-sdk/sdk-core');
  Telebirr = sdk.Telebirr;
  PaymentStatus = sdk.PaymentStatus;
  isSdkAvailable = true;

  if (!MOCK_TELEBIRR) {
    telebirrClient = new Telebirr({
      environment: process.env.TELEBIRR_ENVIRONMENT,
      fabricAppId: process.env.TELEBIRR_FABRIC_APP_ID,
      merchantAppId: process.env.TELEBIRR_MERCHANT_APP_ID,
      merchantCode: process.env.TELEBIRR_MERCHANT_CODE,
      appSecret: process.env.TELEBIRR_APP_SECRET,
      privateKeyPem: process.env.TELEBIRR_PRIVATE_KEY_PEM,
      shortCode: process.env.TELEBIRR_SHORT_CODE,
      notifyUrl: process.env.TELEBIRR_NOTIFY_URL,
    });
  }
} catch (error) {
  isSdkAvailable = false;
  console.warn('Telebirr SDK not installed. Real payments will fail. Mock mode is active.');
}

async function createCheckoutUrl(amount, orderId) {
  if (MOCK_TELEBIRR) {
    return `http://localhost:5173/mock-checkout?amount=${amount}&orderId=${orderId}`;
  }

  if (!isSdkAvailable || !telebirrClient) {
    throw new Error('Telebirr SDK is not installed.');
  }

  const order = await telebirrClient.payments.charge({
    amount: String(amount),
    title: 'Bingo Wallet Top-Up',
    orderId: orderId,
  });
  return order.checkoutUrl || order.redirectUrl || order.url || '';
}

async function verifyTransaction(receiptNumber) {
  if (MOCK_TELEBIRR) {
    if (String(receiptNumber || '').startsWith('MOCK-')) {
      return { success: true, amount: 50, payerName: 'Mock User', receiptNumber };
    }
    return { success: false };
  }

  if (!isSdkAvailable || !telebirrClient) {
    throw new Error('Telebirr SDK is not installed.');
  }

  const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${encodeURIComponent(receiptNumber)}`;
  const response = await fetch(receiptUrl);
  if (!response.ok) {
    return {
      success: false,
      amount: null,
      payerName: null,
      receiptNumber,
    };
  }

  const html = await response.text();
  const amountMatch = html.match(/Amount[^0-9]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  const payerMatch = html.match(/Payer(?:\s*Name)?[^<]*<[^>]*>\s*([^<]+)/i) || html.match(/Payer(?:\s*Name)?[:\s]*([^<\n]+)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null;
  const payerName = payerMatch ? payerMatch[1].trim() : null;

  return {
    success: Boolean(amount),
    amount,
    payerName,
    receiptNumber,
  };
}

module.exports = {
  MOCK_TELEBIRR,
  isSdkAvailable,
  Telebirr,
  PaymentStatus,
  telebirrClient,
  createCheckoutUrl,
  verifyTransaction,
};
