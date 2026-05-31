-- Reviewable snapshot of the project's Postgres functions (RPCs).
--
-- The SOURCE OF TRUTH is the live Supabase database — these functions are
-- managed via migrations / the Supabase MCP, not a local supabase/ dir. This
-- file mirrors the current production definitions so the logic (esp. the
-- credit/vote race-safety guarantees the app depends on) is reviewable in the
-- repo. Audit finding MONEY-2 flagged that the bodies weren't versioned.
--
-- Pulled 2026-05-30 via pg_get_functiondef. Keep in sync when these change.
-- (Trigger fn set_flight_bookings_updated_at is a trivial NEW.updated_at = now()
-- and is omitted.)

-- Atomic per-user AI-credit charge. Single locked UPDATE … += … RETURNING —
-- this is what makes parallel build chunks safe (no read-then-write clobber).
CREATE OR REPLACE FUNCTION public.increment_user_ai_credits(p_user_id uuid, p_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new integer;
BEGIN
  UPDATE public.profiles
  SET ai_credits_used = ai_credits_used + p_amount
  WHERE id = p_user_id
  RETURNING ai_credits_used INTO v_new;
  RETURN v_new;
END;
$function$;

-- Atomic per-Trip-Pass AI-credit charge (the shared pool path).
CREATE OR REPLACE FUNCTION public.increment_trip_pass_credits(p_pass_id uuid, p_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new integer;
BEGIN
  UPDATE public.trip_passes
  SET ai_credits_used = ai_credits_used + p_amount
  WHERE id = p_pass_id
  RETURNING ai_credits_used INTO v_new;
  RETURN v_new;
END;
$function$;

-- Single-pick vote cast: row-lock the parent vote so concurrent casts
-- serialize, then replace this user's prior response.
CREATE OR REPLACE FUNCTION public.cast_single_pick_vote(p_vote_id uuid, p_user_id uuid, p_voter_name text, p_option_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Lock the parent vote row so concurrent calls serialize.
  PERFORM 1 FROM public.group_votes WHERE id = p_vote_id FOR UPDATE;

  -- Replace any prior responses from this user on this vote, then insert.
  DELETE FROM public.vote_responses
  WHERE vote_id = p_vote_id AND user_id = p_user_id;

  INSERT INTO public.vote_responses (vote_id, option_id, voter_name, user_id)
  VALUES (p_vote_id, p_option_id, p_voter_name, p_user_id);
END;
$function$;

-- Atomic fixed-window rate limiter (used by invite email/SMS, password reset,
-- destination-search, verify-venues). Returns true when under the limit.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_attempts integer;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, attempts, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
  SET
    attempts = CASE
      WHEN rate_limits.window_start + (p_window_seconds || ' seconds')::interval <= v_now
        THEN 1
      ELSE rate_limits.attempts + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start + (p_window_seconds || ' seconds')::interval <= v_now
        THEN v_now
      ELSE rate_limits.window_start
    END
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_limit;
END;
$function$;
