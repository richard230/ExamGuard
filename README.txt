EXAMGUARD PAYSTACK DVA PERSISTENCE + WEBHOOK FIX

Files:
  routes/finance.js          Updated finance router
  routes/scratchCards.js     Updated Paystack webhook + existing scratch-card routes
  models/SchoolWallet.js     Existing shared wallet model (included for matching schema)
  app.js                     Removes duplicate JSON parser; preserves raw-body capture

Deployment:
1. Replace the corresponding files in your backend repository.
2. Commit and deploy to Render.
3. Do NOT delete the existing Paystack dedicated account and do NOT manually create another one.
4. After deployment, call GET /api/finance/school-wallet and confirm dedicatedAccount is present.
5. If it is still absent, use the existing create-account endpoint only once after confirming the Paystack customer still returns the already-created dedicated_account. The updated route reuses that Paystack account where returned; it does not intentionally create a second account when the customer object contains an active assigned DVA.
6. Resend the previous successful DVA charge.success webhook from Paystack after the local wallet mapping is confirmed. The webhook now returns HTTP 503 if a successful transfer cannot be mapped, rather than acknowledging it as handled.

Key changes:
- MongoDB write results are logged with acknowledged/matched/modified/upserted counts.
- Read-back uses the canonical schoolId first and separately validates the saved account number and active flag.
- Duplicate account-number conflicts are logged and are not silently moved between schools.
- Webhook account-number extraction is more tolerant of Paystack response shapes and normalizes digits.
- A successful transfer with no matching wallet is not acknowledged; Paystack receives HTTP 503 so it can retry.
- Customer-code matching is only used if the receiving account number is absent; supplied account numbers must match exactly.
- app.js retains the first express.json parser with req.rawBody capture and removes the duplicate parser.

IMPORTANT:
- Do not manually credit the old NGN 100 transfer until checking whether it has already been credited. Use its reference to check wallet.transactions first.
- The previous transfer reference reported by the user was:
  100004261120045647178038717323
- The old transfer will not automatically replay merely because code is deployed. Resend the event from Paystack or use a separately verified recovery process.
