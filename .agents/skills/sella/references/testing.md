# Testing playbook

Playground site: `../emdash-marketing-site` (sibling of this repo), dev server
usually on :4321/:4323 — detect via the `astro dev` log, never assume the port.

## 1. Seed

```bash
cd ../emdash-marketing-site
npx emdash seed --validate seed/seed.json   # must pass before apply
npx emdash seed seed/seed.json              # skip-on-conflict; use fresh DB for clean tests:
npx astro dev stop; rm -f data.db; rm -rf uploads; npx emdash seed seed/seed.json
```

## 2. Endpoint checks (no keys needed)

```bash
P=http://localhost:PORT
curl -s -X POST $P/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"WELCOME10","subtotal":200}'
# expired OLD20 / exhausted ONCE25 / min-subtotal TRAIL20@20 / unknown NOPE
curl -s -X POST $P/api/reviews -H 'Content-Type: application/json' -d '{"product_slug":"meridian-steel-watch","rating":5,"title":"T","body":"long enough body text","author":"QA"}'  # → 201
curl -s -X POST $P/api/checkout -H 'Content-Type: application/json' -d '{"email":"a@b.com","items":[{"slug":"x","qty":1}]}'  # → 501 without keys
curl -s -X POST $P/api/stripe-webhook -d '{}'  # → 500 NOT_CONFIGURED / 400 without sig
```

## 3. Full payment lifecycle (no live keys needed)

Needs `STRIPE_WEBHOOK_SECRET=test_wh_secret` on the dev server env.

```bash
# a) dev session cookie (dev-bypass; creates dev@emdash.local — see gotchas #13)
COOKIE=$(curl -s -D - -o /dev/null $P/_emdash/api/auth/dev-bypass | grep -i set-cookie | grep -o 'astro-session=[^;]*')
# b) create pending order: POST $P/_emdash/api/content/orders {slug, data:{...order_status:"pending", stripe_session_id:"cs_test_X"...}}
# c) publish it: POST $P/_emdash/api/content/orders/{ULID}/publish  (both with Cookie + X-EmDash-Request: 1)
# d) sign event with the stripe SDK:
node -e "import('stripe').then(async ({default:Stripe}) => {
  const s = new Stripe('sk_test_dummy');
  const payload = JSON.stringify({id:'evt_1',object:'event',type:'checkout.session.completed',
    data:{object:{id:'cs_test_X',payment_intent:'pi_test_X',amount_total:17010,
      metadata:{order_number:'NW-...',coupon_code:'WELCOME10',items:'[{\"slug\":\"...\",\"qty\":1}]'}}}});
  const h = s.webhooks.generateTestHeaderString({payload, secret:'test_wh_secret'});
  const r = await fetch('$P/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':h,'Content-Type':'application/json'},body:payload});
  console.log(r.status, await r.text());
})" --input-type=module
# e) ground truth (run from site dir):
python3 -c "import sqlite3; db=sqlite3.connect('data.db'); print(db.execute(\"select order_number,status,order_status from ec_orders\").fetchall())"
```

Expect: order paid, stock decremented exactly, coupon +1 exactly. Redeliver the
same event → still exactly-once (paid guard).

## 4. Cleanup

Delete test orders/reviews via REST (`DELETE /_emdash/api/content/{c}/{ulid}`),
reset counters, or fresh-reseed. Never leave `dev@emdash.local` blocking human
setup — delete the row if the wizard complains (see gotchas #13).

## 5. Build

```bash
npm run build   # template: astro build must print Complete!
cd ../../sella/packages/core && npm run build  # tsdown + dts
```
