# Treeschool production launch checklist

## Supabase authentication

1. In Authentication > URL Configuration, set the site URL to `https://www.treehomeschool.com` and allow `https://www.treehomeschool.com/auth/confirm`.
2. Configure a production SMTP provider in Authentication > Email. Authenticate the sending domain with SPF, DKIM, and DMARC.
3. Replace the Magic Link email body with `scripts/supabase/magic-link-template.html` and use a subject such as `Your Treeschool sign-in code`.
4. Disable click/open tracking for authentication email. Tracking and security prefetch can rewrite or consume one-time links; the Treeschool confirmation page deliberately requires a second click.
5. Test delivery and code entry with Gmail, Outlook, and a mobile mail client.

## Stripe

1. Create the production webhook endpoint `https://www.treehomeschool.com/api/billing/stripe-webhook`.
2. Subscribe it to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Store its signing secret as `STRIPE_WEBHOOK_SECRET` in GCP Secret Manager and redeploy.
4. Confirm the Stripe price IDs refer to live recurring USD prices: `STRIPE_MONTHLY_PRICE_ID` = $20/month, `STRIPE_YEARLY_PRICE_ID` = $200/year, `STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID` = $5/month, and `STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID` = $50/year. The first-time monthly checkout invoices the $6 introductory month plus $2 for each student beyond three separately.
5. Enable and brand the Stripe Customer Portal for cancellation and payment-method updates. Keep plan and quantity changes disabled; Treeschool owns student-seat quantities so they cannot drift from child profiles.

## Failure alerts and retries

Set optional `ADMIN_ALERT_WEBHOOK_URL` on the processor job to a private operations webhook. Permanent document and weekly-plan failures are always emitted as structured Cloud Logging errors; the webhook adds an immediate notification.

Retry a permanently failed paid pack from a trusted terminal:

```sh
INTAKE_ID="the-plan-pack-intake-id"
API_URL="https://treeschool-api-635939195300.asia-northeast3.run.app"
INTERNAL_API_SECRET="$(gcloud secrets versions access latest --secret INTERNAL_API_SECRET --project treeschool)"
curl --fail-with-body -X POST "${API_URL}/internal/plan-pack/retry" \
  -H "content-type: application/json" \
  -H "x-treeschool-internal-secret: ${INTERNAL_API_SECRET}" \
  --data "{\"intakeId\":\"${INTAKE_ID}\"}"
unset INTERNAL_API_SECRET
```

## Production rehearsal

- Complete a real one-time Pack purchase with a controlled email address.
- Upload a representative large PDF plus a supporting text/image file.
- Confirm direct GCS upload, indexing, weekly-plan generation, and PDF download.
- Sign in using both the email button and the numeric code.
- Confirm the session remains active after the access token is refreshed.
- Open the email on a different device and use the code on the original device.
- Exercise first-time monthly purchases with one, three, and four existing students. Confirm Stripe charges $6 plus $2 per student beyond three immediately, then schedules $20 plus $5 per additional student for 30 days later.
- During the introductory month, confirm one successful initial lesson plan per paid student seat, failed attempts do not consume an allowance, and replanning stays locked until renewal.
- Add a fourth student during both the introductory and regular billing periods. Confirm the explanatory dialog, paid Checkout, webhook-created profile, recurring add-on quantity, and webhook replay idempotency.
- Exercise Customer Portal cancellation and a technical-failure refund. Successful generated plans are not covered by a change-of-mind refund.
- Confirm Stripe webhook delivery shows HTTP 200 for every supported event.
- Force one test job failure in a non-production copy, verify the alert, and exercise the retry endpoint.
- Request deletion of the rehearsal account and verify source files are removed before declaring the deletion workflow complete.
