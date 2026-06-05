# Migration runbook — 4 tiers → 3 (Explorer + Nomad → Travel Pro)

> **Status: NOT YET APPLIED.** These steps touch the production database and
> Stripe. Run them in this order, with Brandon's explicit approval per step.
> The code change (branch `feat/three-tier-travel-pro`) is written to be
> **safe with un-migrated rows** — `normalizeTier()` maps any lingering
> `explorer`/`nomad` value to `travel_pro` at every read — so there is no
> hard ordering dependency between deploy and data migration EXCEPT the
> constraint (Step 1), which must land before any code writes `travel_pro`.

Current DB state (read 2026-06-05): `profiles.subscription_tier` is a **text
column with a CHECK constraint**, not a Postgres enum:

```
CHECK (subscription_tier = ANY (ARRAY['free','trip_pass','explorer','nomad']))
```

Tier distribution at time of writing: **nomad 4, explorer 3, free 1** (test/dev accounts).

---

## Step 0 — Brandon: create the new Stripe prices (test mode now, live at launch)

Create in the Stripe dashboard and paste the IDs into
`src/lib/stripe-prices.ts` (replacing the `price_REPLACE_ME_*` placeholders):

| Product | Price | Paste into |
|---|---|---|
| Travel Pro — monthly | **$14.99 / month** recurring | `STRIPE_PRICES.travel_pro.monthly` |
| Travel Pro — annual | **$149 / year** recurring | `STRIPE_PRICES.travel_pro.annual` |
| Trip Pass — base | **$36 one-time** | `STRIPE_PRICES.trip_pass.base` |

The $4 extra-person price is unchanged (kept). The old Explorer/Nomad price IDs
are retained in `STRIPE_PRICES.legacy` so existing subscribers' renewal webhooks
still resolve to `travel_pro` — **do not delete them** until all subs migrate.

---

## Step 1 — DDL: widen the CHECK constraint (MUST run before code deploy)

Backward-compatible: allows the new value while still allowing the legacy ones,
so nothing breaks during the rollout window.

```sql
ALTER TABLE public.profiles DROP CONSTRAINT profiles_subscription_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier = ANY (ARRAY['free','trip_pass','travel_pro','explorer','nomad']));
```

Why first: once the new code is live, the Stripe webhook writes `'travel_pro'`
for any subscription renewal. If the constraint hasn't been widened, that write
fails. Run Step 1, confirm, **then** merge/deploy the branch.

---

## Step 2 — DML: migrate existing Explorer/Nomad users to Travel Pro

Run **after** Step 1 and after the code is deployed. Caps `ai_credits_used` at
the new 150 ceiling so a former Nomad mid-cycle (who may have used >150) isn't
left over-limit in a weird state.

```sql
UPDATE public.profiles
SET subscription_tier = 'travel_pro',
    ai_credits_used    = LEAST(COALESCE(ai_credits_used, 0), 150)
WHERE subscription_tier IN ('explorer', 'nomad');
```

Verify:

```sql
SELECT subscription_tier, COUNT(*) FROM public.profiles GROUP BY subscription_tier;
-- expect only: free, trip_pass, travel_pro
```

---

## Step 3 — Stripe: migrate existing Explorer subscriptions to $14.99 (launch, live mode)

Per Brandon's decision: existing Explorer subscribers ($7.99) move to the
Travel Pro price ($14.99) **at their next renewal** (not an immediate charge).
Nomad subscribers are already at $14.99, so they're unaffected.

For each active Explorer subscription, update the subscription item to the new
Travel Pro monthly price with `proration_behavior: 'none'` so the new rate
takes effect at the next cycle (no mid-cycle charge). This is a live-billing
operation — do it in Stripe (dashboard or a one-off script) at launch, and
consider an email heads-up since it's a price increase. The DB tier is already
`travel_pro` from Step 2 regardless of the Stripe price, so features are correct
in the meantime.

---

## Step 4 — Cleanup (optional, AFTER a bake period)

Once `SELECT` confirms zero `explorer`/`nomad` rows remain and all legacy Stripe
subs have rolled to a `travel_pro` price, tighten the constraint and (optionally)
remove the legacy block from `stripe-prices.ts` + `PRICE_TO_TIER`:

```sql
ALTER TABLE public.profiles DROP CONSTRAINT profiles_subscription_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier = ANY (ARRAY['free','trip_pass','travel_pro']));
```

---

## Rollback

- **Before Step 2:** revert the branch; the widened constraint (Step 1) is a
  superset and harmless to leave in place.
- **After Step 2:** the original tier values are lost on migrated rows (they all
  became `travel_pro`). If you need to distinguish former Explorer vs Nomad
  later, snapshot `profiles` (id, subscription_tier) **before** running Step 2:
  ```sql
  CREATE TABLE profiles_tier_backup_20260605 AS
  SELECT id, subscription_tier, ai_credits_used FROM public.profiles
  WHERE subscription_tier IN ('explorer','nomad');
  ```
