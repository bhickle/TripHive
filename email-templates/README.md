# Email Templates

Branded HTML for the Supabase auth emails (signup confirmation, password reset).
The trip-invite email lives inline in `src/app/api/invite/email/route.ts` and is
already branded.

## How to apply

1. Open Supabase Dashboard → Authentication → Email Templates.
2. For each template below:
   - Pick the matching template from the Supabase dropdown.
   - Set the subject line per the comment at the top of the file.
   - Paste the file contents into the **Message body** field (HTML mode).
   - Save.

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your TripCoord account |
| `reset-password.html` | Reset Password | Reset your TripCoord password |

## Brand colors used

- Hero background: `#0c4a6e` (sky-900)
- Body background: `#f5f1e8` (parchment)
- Text: `#3f3f46` (zinc-700)
- Accent / link: `#0c4a6e`
- Subtitle on hero: `#7dd3fc` (sky-300)

If you tune brand colors elsewhere in the app, update these in lockstep.

## Required Supabase config

- **Site URL:** `https://www.tripcoord.ai` (Authentication → URL Configuration)
- **Redirect URLs allowlist** must include `https://www.tripcoord.ai/auth/update-password`
  for the password reset link to land cleanly. See `GOLIVE_CHECKLIST.md`.

## Testing

Send yourself a test by triggering the relevant flow on production:

- **Confirm signup:** sign up with a fresh email at `/auth/signup`
- **Reset password:** click "Forgot password" on `/auth/login`

Check Inbox + Spam — full SendGrid domain auth (DKIM/SPF) is also tracked in
`GOLIVE_CHECKLIST.md` and is what keeps these out of Spam.
