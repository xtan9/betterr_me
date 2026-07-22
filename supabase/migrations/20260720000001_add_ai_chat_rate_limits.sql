-- Atomic per-user AI chat quotas. This is a billing boundary, so callers fail
-- closed when the function is unavailable or returns invalid data.
CREATE TABLE public.ai_chat_usage_windows (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, window_kind, window_start)
);

ALTER TABLE public.ai_chat_usage_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_chat_usage_windows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_ai_chat_rate_limit(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, minute_remaining INTEGER, day_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  minute_count INTEGER;
  day_count INTEGER;
  minute_limit CONSTANT INTEGER := 10;
  day_limit CONSTANT INTEGER := 100;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_chat_usage_windows (user_id, window_kind, window_start, request_count)
  VALUES (p_user_id, 'minute', date_trunc('minute', now()), 1)
  ON CONFLICT (user_id, window_kind, window_start)
  DO UPDATE SET request_count = public.ai_chat_usage_windows.request_count + 1
  RETURNING request_count INTO minute_count;

  INSERT INTO public.ai_chat_usage_windows (user_id, window_kind, window_start, request_count)
  VALUES (p_user_id, 'day', date_trunc('day', now()), 1)
  ON CONFLICT (user_id, window_kind, window_start)
  DO UPDATE SET request_count = public.ai_chat_usage_windows.request_count + 1
  RETURNING request_count INTO day_count;

  DELETE FROM public.ai_chat_usage_windows
  WHERE user_id = p_user_id AND window_start < now() - interval '8 days';

  RETURN QUERY SELECT
    minute_count <= minute_limit AND day_count <= day_limit,
    GREATEST(0, minute_limit - minute_count),
    GREATEST(0, day_limit - day_count);
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_chat_rate_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_chat_rate_limit(UUID) TO authenticated;

ALTER TABLE public.conversations ALTER COLUMN model SET DEFAULT 'gpt-5.4-mini';
