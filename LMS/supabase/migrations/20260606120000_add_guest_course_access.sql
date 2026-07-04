-- Passwordless guest access for individual published courses.
-- Guests still receive a Supabase anonymous-auth identity so progress remains
-- protected by the existing auth.uid()-based RLS policies.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS guest_access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS courses_guest_access_token_key
  ON public.courses (guest_access_token);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_guest_course(access_token uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  org_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $guest_course$
  SELECT c.id, c.title, c.description, o.name
  FROM public.courses c
  JOIN public.organizations o ON o.id = c.org_id
  WHERE c.guest_access_token = access_token
    AND c.guest_access_enabled = true
    AND c.published = true
  LIMIT 1;
$guest_course$;

CREATE OR REPLACE FUNCTION public.register_course_guest(
  course_id uuid,
  access_token uuid,
  guest_full_name text,
  guest_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $register_guest$
DECLARE
  caller_id uuid := auth.uid();
  target_course public.courses%ROWTYPE;
  normalized_name text := btrim(guest_full_name);
  normalized_phone text := regexp_replace(guest_phone, '[^0-9+]', '', 'g');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Guest authentication is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = caller_id
      AND is_anonymous = true
  ) THEN
    RAISE EXCEPTION 'This entry link is intended for guest users';
  END IF;

  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;

  IF normalized_phone !~ '^\+?[0-9]{9,15}$' THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;

  SELECT *
  INTO target_course
  FROM public.courses
  WHERE id = course_id
    AND guest_access_token = access_token
    AND guest_access_enabled = true
    AND published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest access is not available for this course';
  END IF;

  INSERT INTO public.profiles (
    id,
    org_id,
    full_name,
    phone,
    role,
    is_guest
  )
  VALUES (
    caller_id,
    target_course.org_id,
    normalized_name,
    normalized_phone,
    'learner',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      org_id = EXCLUDED.org_id
  WHERE public.profiles.is_guest = true;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = caller_id AND is_guest = true
  ) THEN
    RAISE EXCEPTION 'Could not create guest profile';
  END IF;

  INSERT INTO public.learner_progress (
    user_id,
    course_id,
    org_id,
    status,
    progress_percent,
    last_accessed
  )
  VALUES (
    caller_id,
    target_course.id,
    target_course.org_id,
    'not_started',
    null,
    now()
  )
  ON CONFLICT (user_id, course_id) DO UPDATE
  SET last_accessed = now();

  RETURN target_course.id;
END;
$register_guest$;

REVOKE ALL ON FUNCTION public.get_guest_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_course_guest(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_course(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_course_guest(uuid, uuid, text, text) TO authenticated;
