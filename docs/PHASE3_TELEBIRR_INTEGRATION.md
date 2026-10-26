# Phase 3 Telebirr Integration

## Status
- Sandbox: implemented and tested.
- Production: blocked pending official documentation and approved merchant credentials.

## Environment separation
- `TELEBIRR_ENV=sandbox` uses mock checkout.
- `TELEBIRR_ENV=production` requires app ID, app key, short code, notify URL.
- Unsupported values are rejected by startup validation.

## Mock payment usage
- Local development defaults to `PAYMENT_PROVIDER=mock` (or `NODE_ENV !== production`).
- Mock endpoints are only available when the mock provider is enabled; production returns 404.
- `POST /api/telebirr/deposit` creates a pending deposit and returns a mock checkout URL.
- `GET /api/telebirr/mock/checkout` renders a clearly labeled test checkout page.
- `POST /api/telebirr/mock/confirm` supports `success`, `failed`, `cancelled`, and `pending` outcomes and is idempotent for duplicate success.
- No real Telebirr credentials are required or used for mock payments.

## Fail-closed behavior
- Production webhook signature verification returns false until the documented canonical algorithm is implemented.
- Production deposit cannot silently fall back to mock success.

## Required before production
- Official canonical signature algorithm and field mapping.
- Verified production base URL and endpoints.
- Merchant approval for disbursement/payout, if supported.