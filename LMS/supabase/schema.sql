-- Align LMS Supabase schema
-- Run in Supabase SQL Editor for a fresh project.
--
-- This creates the database objects used by the current app:
-- organizations, profiles, courses, learning content files, categories, groups,
-- learner progress, guest access RPCs, RLS policies, and the private
-- scorm_packages storage bucket.
--
-- Still required outside SQL:
-- 1. Deploy Edge Functions: create-user, update-user, delete-user, scorm-asset.
-- 2. Set each function's SUPABASE_SERVICE_ROLE_KEY secret.
-- 3. Enable Anonymous sign-ins in Supabase Auth if guest links are used.
-- 4. Create the first Auth user manually, then insert its profile row.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#0066FF',
  welcome_message text NOT NULL DEFAULT '',
  auto_enroll_course_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  email text,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'learner',
  is_guest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'admin', 'org_admin', 'learner')),
  CONSTRAINT profiles_super_admin_owner_check CHECK (
    role <> 'super_admin'
    OR email IS NULL
    OR lower(email) IN ('shahar.cohen@improve-it.co.il', 'shaharsolutions@gmail.com')
  )
);

CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'כללי',
  content_type text NOT NULL DEFAULT 'scorm',
  published boolean NOT NULL DEFAULT false,
  entry_point text NOT NULL DEFAULT 'index.html',
  guest_access_enabled boolean NOT NULL DEFAULT false,
  guest_access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT courses_content_type_check CHECK (content_type IN ('scorm', 'video', 'pdf', 'presentation'))
);

CREATE TABLE IF NOT EXISTS public.course_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (course_id, file_path)
);

CREATE TABLE IF NOT EXISTS public.course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (course_id, org_id)
);

CREATE TABLE IF NOT EXISTS public.learner_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  progress_percent integer,
  score integer,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  suspend_data text,
  lesson_location text,
  started_at timestamptz,
  completed_at timestamptz,
  last_accessed timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT learner_progress_status_check CHECK (status IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT learner_progress_percent_check CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.course_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (group_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS courses_guest_access_token_key
  ON public.courses (guest_access_token);

CREATE UNIQUE INDEX IF NOT EXISTS course_categories_unique_name_per_org
  ON public.course_categories (lower(name), COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles (org_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS courses_org_id_idx ON public.courses (org_id);
CREATE INDEX IF NOT EXISTS learner_progress_user_id_idx ON public.learner_progress (user_id);
CREATE INDEX IF NOT EXISTS learner_progress_course_id_idx ON public.learner_progress (course_id);
CREATE INDEX IF NOT EXISTS learner_progress_org_id_idx ON public.learner_progress (org_id);
CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON public.group_members (user_id);
CREATE INDEX IF NOT EXISTS group_assignments_course_id_idx ON public.group_assignments (course_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx ON public.activity_logs (actor_id);
CREATE INDEX IF NOT EXISTS activity_logs_org_id_idx ON public.activity_logs (org_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON public.activity_logs (action);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS courses_set_updated_at ON public.courses;
CREATE TRIGGER courses_set_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learner_progress_set_updated_at ON public.learner_progress;
CREATE TRIGGER learner_progress_set_updated_at
BEFORE UPDATE ON public.learner_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS course_categories_set_updated_at ON public.course_categories;
CREATE TRIGGER course_categories_set_updated_at
BEFORE UPDATE ON public.course_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS groups_set_updated_at ON public.groups;
CREATE TRIGGER groups_set_updated_at
BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.current_profile_role() = 'super_admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_management_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.current_profile_role() IN ('super_admin', 'admin', 'org_admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(v_target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_profile_role() = 'super_admin'
    OR (
      public.current_profile_role() IN ('admin', 'org_admin')
      AND public.current_profile_org_id() = v_target_org_id
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.group_org_id(target_group_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM public.groups WHERE id = target_group_id;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_manage_org(public.group_org_id(target_group_id));
$$;

CREATE OR REPLACE FUNCTION public.can_assign_user_to_group(
  target_group_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_manage_group(target_group_id)
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      JOIN public.profiles p ON p.id = target_user_id
      WHERE g.id = target_group_id
        AND p.org_id = g.org_id
        AND p.role = 'learner'
    );
$$;

CREATE OR REPLACE FUNCTION public.activity_log_changed_fields(v_old_data jsonb, v_new_data jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
  FROM (
    SELECT key FROM jsonb_object_keys(COALESCE(v_old_data, '{}'::jsonb)) AS old_keys(key)
    UNION
    SELECT key FROM jsonb_object_keys(COALESCE(v_new_data, '{}'::jsonb)) AS new_keys(key)
  ) keys
  WHERE COALESCE(v_old_data, '{}'::jsonb) -> key IS DISTINCT FROM COALESCE(v_new_data, '{}'::jsonb) -> key;
$$;

CREATE OR REPLACE FUNCTION public.write_activity_log_for_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS '
DECLARE
  v_row_data jsonb;
  v_old_data jsonb := NULL;
  v_new_data jsonb := NULL;
  v_target_org_id uuid := NULL;
  v_actor_name text := NULL;
  v_actor_role text := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = ''DELETE'' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = ''DELETE'' THEN
    v_row_data := to_jsonb(OLD);
    v_old_data := to_jsonb(OLD);
  ELSIF TG_OP = ''UPDATE'' THEN
    v_row_data := to_jsonb(NEW);
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    IF v_old_data = v_new_data THEN
      RETURN NEW;
    END IF;
  ELSE
    v_row_data := to_jsonb(NEW);
    v_new_data := to_jsonb(NEW);
  END IF;

  BEGIN
    IF v_row_data ? ''org_id'' AND NULLIF(v_row_data ->> ''org_id'', '''') IS NOT NULL THEN
      v_target_org_id := (v_row_data ->> ''org_id'')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    v_target_org_id := NULL;
  END;

  IF v_target_org_id IS NULL AND TG_TABLE_NAME IN (''group_members'', ''group_assignments'') THEN
    v_target_org_id := (
      SELECT g.org_id
      FROM public.groups g
      WHERE g.id = (v_row_data ->> ''group_id'')::uuid
      LIMIT 1
    );
  END IF;

  v_actor_name := (
    SELECT p.full_name
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  );

  v_actor_role := (
    SELECT p.role
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  );

  INSERT INTO public.activity_logs (
    actor_id,
    actor_name,
    actor_role,
    org_id,
    action,
    entity_type,
    entity_id,
    entity_label,
    details
  )
  VALUES (
    auth.uid(),
    v_actor_name,
    v_actor_role,
    v_target_org_id,
    CASE TG_OP
      WHEN ''INSERT'' THEN ''create''
      WHEN ''UPDATE'' THEN ''update''
      WHEN ''DELETE'' THEN ''delete''
      ELSE lower(TG_OP)
    END,
    TG_TABLE_NAME,
    v_row_data ->> ''id'',
    COALESCE(v_row_data ->> ''name'', v_row_data ->> ''title'', v_row_data ->> ''full_name''),
    jsonb_build_object(
      ''table'', TG_TABLE_NAME,
      ''changed_fields'', public.activity_log_changed_fields(v_old_data, v_new_data)
    )
  );

  IF TG_OP = ''DELETE'' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
';

CREATE OR REPLACE FUNCTION public.log_activity(
  action text,
  entity_type text DEFAULT 'system',
  entity_id text DEFAULT NULL,
  entity_label text DEFAULT NULL,
  org_id uuid DEFAULT NULL,
  details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  log_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT *
  INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.activity_logs (
    actor_id,
    actor_name,
    actor_role,
    org_id,
    action,
    entity_type,
    entity_id,
    entity_label,
    details
  )
  VALUES (
    auth.uid(),
    caller_profile.full_name,
    caller_profile.role,
    COALESCE(org_id, caller_profile.org_id),
    action,
    COALESCE(entity_type, 'system'),
    entity_id,
    entity_label,
    COALESCE(details, '{}'::jsonb)
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_auto_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_ids uuid[];
  cid uuid;
BEGIN
  IF NEW.org_id IS NULL OR NEW.role <> 'learner' THEN
    RETURN NEW;
  END IF;

  SELECT auto_enroll_course_ids
  INTO target_ids
  FROM public.organizations
  WHERE id = NEW.org_id;

  IF target_ids IS NOT NULL AND array_length(target_ids, 1) > 0 THEN
    FOREACH cid IN ARRAY target_ids LOOP
      INSERT INTO public.learner_progress (org_id, user_id, course_id, status, progress_percent, last_accessed)
      VALUES (NEW.org_id, NEW.id, cid, 'not_started', NULL, now())
      ON CONFLICT (user_id, course_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_enroll ON public.profiles;
CREATE TRIGGER on_profile_created_enroll
AFTER INSERT OR UPDATE OF org_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_auto_enrollment();

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
AS $$
  SELECT c.id, c.title, c.description, o.name
  FROM public.courses c
  JOIN public.organizations o ON o.id = c.org_id
  WHERE c.guest_access_token = access_token
    AND c.guest_access_enabled = true
    AND c.published = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_course_guest_impl(
  p_course_id uuid,
  access_token uuid,
  guest_full_name text,
  guest_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
  WHERE id = p_course_id
    AND guest_access_token = access_token
    AND guest_access_enabled = true
    AND published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest access is not available for this course';
  END IF;

  INSERT INTO public.profiles (id, org_id, full_name, phone, role, is_guest)
  VALUES (caller_id, target_course.org_id, normalized_name, normalized_phone, 'learner', true)
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

  INSERT INTO public.learner_progress (user_id, course_id, org_id, status, progress_percent, last_accessed)
  VALUES (caller_id, target_course.id, target_course.org_id, 'not_started', NULL, now())
  ON CONFLICT (user_id, course_id) DO UPDATE
  SET last_accessed = now();

  RETURN target_course.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_course_guest(
  course_id uuid,
  access_token uuid,
  guest_full_name text,
  guest_phone text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.register_course_guest_impl($1, $2, $3, $4);
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS organizations_activity_log ON public.organizations;
CREATE TRIGGER organizations_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS profiles_activity_log ON public.profiles;
CREATE TRIGGER profiles_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS courses_activity_log ON public.courses;
CREATE TRIGGER courses_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS course_files_activity_log ON public.course_files;
CREATE TRIGGER course_files_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.course_files
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS course_assignments_activity_log ON public.course_assignments;
CREATE TRIGGER course_assignments_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.course_assignments
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS learner_progress_activity_log ON public.learner_progress;
CREATE TRIGGER learner_progress_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.learner_progress
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS course_categories_activity_log ON public.course_categories;
CREATE TRIGGER course_categories_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.course_categories
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS groups_activity_log ON public.groups;
CREATE TRIGGER groups_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS group_members_activity_log ON public.group_members;
CREATE TRIGGER group_members_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP TRIGGER IF EXISTS group_assignments_activity_log ON public.group_assignments;
CREATE TRIGGER group_assignments_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.group_assignments
FOR EACH ROW EXECUTE FUNCTION public.write_activity_log_for_table_change();

DROP POLICY IF EXISTS "activity_logs_super_admin_select" ON public.activity_logs;
CREATE POLICY "activity_logs_super_admin_select"
ON public.activity_logs FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
CREATE POLICY "organizations_select_authenticated"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_super_admin() OR id = public.current_profile_org_id());

DROP POLICY IF EXISTS "organizations_super_admin_insert" ON public.organizations;
CREATE POLICY "organizations_super_admin_insert"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "organizations_manage" ON public.organizations;
CREATE POLICY "organizations_manage"
ON public.organizations FOR UPDATE
TO authenticated
USING (public.can_manage_org(id))
WITH CHECK (public.can_manage_org(id));

DROP POLICY IF EXISTS "organizations_super_admin_delete" ON public.organizations;
CREATE POLICY "organizations_super_admin_delete"
ON public.organizations FOR DELETE
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "profiles_org_admin_manage" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON TABLE public.profiles TO authenticated;

CREATE POLICY "profiles_select"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.current_profile_role() IN ('admin', 'org_admin')
    AND org_id = public.current_profile_org_id()
  )
);

CREATE POLICY "profiles_update"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.current_profile_role() IN ('admin', 'org_admin')
    AND org_id = public.current_profile_org_id()
    AND role = 'learner'
  )
)
WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.current_profile_role() IN ('admin', 'org_admin')
    AND org_id = public.current_profile_org_id()
    AND role = 'learner'
  )
);

DROP POLICY IF EXISTS "courses_select" ON public.courses;
CREATE POLICY "courses_select"
ON public.courses FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR org_id = public.current_profile_org_id()
  OR EXISTS (
    SELECT 1
    FROM public.course_assignments assignment
    WHERE assignment.course_id = courses.id
      AND assignment.org_id = public.current_profile_org_id()
  )
);

DROP POLICY IF EXISTS "courses_insert" ON public.courses;
CREATE POLICY "courses_insert"
ON public.courses FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_org(org_id));

DROP POLICY IF EXISTS "courses_update" ON public.courses;
CREATE POLICY "courses_update"
ON public.courses FOR UPDATE
TO authenticated
USING (public.can_manage_org(org_id))
WITH CHECK (public.can_manage_org(org_id));

DROP POLICY IF EXISTS "courses_delete" ON public.courses;
CREATE POLICY "courses_delete"
ON public.courses FOR DELETE
TO authenticated
USING (public.can_manage_org(org_id));

DROP POLICY IF EXISTS "course_files_select" ON public.course_files;
CREATE POLICY "course_files_select"
ON public.course_files FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_files.course_id
      AND (
        public.is_super_admin()
        OR c.org_id = public.current_profile_org_id()
        OR EXISTS (
          SELECT 1
          FROM public.course_assignments assignment
          WHERE assignment.course_id = c.id
            AND assignment.org_id = public.current_profile_org_id()
        )
      )
  )
);

DROP POLICY IF EXISTS "course_files_manage" ON public.course_files;
CREATE POLICY "course_files_manage"
ON public.course_files FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_files.course_id
      AND public.can_manage_org(c.org_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_files.course_id
      AND public.can_manage_org(c.org_id)
  )
);

DROP POLICY IF EXISTS "course_assignments_select" ON public.course_assignments;
CREATE POLICY "course_assignments_select"
ON public.course_assignments FOR SELECT
TO authenticated
USING (public.is_super_admin() OR org_id = public.current_profile_org_id());

DROP POLICY IF EXISTS "course_assignments_manage" ON public.course_assignments;
CREATE POLICY "course_assignments_manage"
ON public.course_assignments FOR ALL
TO authenticated
USING (public.can_manage_org(org_id))
WITH CHECK (public.can_manage_org(org_id));

DROP POLICY IF EXISTS "learner_progress_select" ON public.learner_progress;
CREATE POLICY "learner_progress_select"
ON public.learner_progress FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_org(org_id)
);

DROP POLICY IF EXISTS "learner_progress_insert" ON public.learner_progress;
CREATE POLICY "learner_progress_insert"
ON public.learner_progress FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.can_manage_org(org_id)
);

DROP POLICY IF EXISTS "learner_progress_update" ON public.learner_progress;
CREATE POLICY "learner_progress_update"
ON public.learner_progress FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_org(org_id)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.can_manage_org(org_id)
);

DROP POLICY IF EXISTS "learner_progress_delete" ON public.learner_progress;
CREATE POLICY "learner_progress_delete"
ON public.learner_progress FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_org(org_id)
);

DROP POLICY IF EXISTS "course_categories_select" ON public.course_categories;
CREATE POLICY "course_categories_select"
ON public.course_categories FOR SELECT
TO authenticated
USING (org_id IS NULL OR public.is_super_admin() OR org_id = public.current_profile_org_id());

DROP POLICY IF EXISTS "course_categories_manage" ON public.course_categories;
CREATE POLICY "course_categories_manage"
ON public.course_categories FOR ALL
TO authenticated
USING (org_id IS NULL OR public.can_manage_org(org_id))
WITH CHECK (org_id IS NULL OR public.can_manage_org(org_id));

DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select"
ON public.groups FOR SELECT
TO authenticated
USING (
  public.can_manage_org(org_id)
  OR public.is_group_member(id)
);

DROP POLICY IF EXISTS "groups_manage" ON public.groups;
CREATE POLICY "groups_manage"
ON public.groups FOR ALL
TO authenticated
USING (public.can_manage_org(org_id))
WITH CHECK (public.can_manage_org(org_id));

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select"
ON public.group_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_group(group_id)
);

DROP POLICY IF EXISTS "group_members_manage" ON public.group_members;
CREATE POLICY "group_members_manage"
ON public.group_members FOR ALL
TO authenticated
USING (public.can_manage_group(group_id))
WITH CHECK (public.can_assign_user_to_group(group_id, user_id));

DROP POLICY IF EXISTS "group_assignments_select" ON public.group_assignments;
CREATE POLICY "group_assignments_select"
ON public.group_assignments FOR SELECT
TO authenticated
USING (
  public.can_manage_group(group_id)
  OR public.is_group_member(group_id)
);

DROP POLICY IF EXISTS "group_assignments_manage" ON public.group_assignments;
CREATE POLICY "group_assignments_manage"
ON public.group_assignments FOR ALL
TO authenticated
USING (public.can_manage_group(group_id))
WITH CHECK (public.can_manage_group(group_id));

INSERT INTO public.course_categories (name)
VALUES ('כללי'), ('אבטחת מידע'), ('משאבי אנוש'), ('טכנולוגיה')
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scorm_packages', 'scorm_packages', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 104857600,
    allowed_mime_types = NULL;

DROP POLICY IF EXISTS "scorm_packages_select" ON storage.objects;
CREATE POLICY "scorm_packages_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (
          p.role IN ('admin', 'org_admin')
          AND regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
        )
      )
  )
);

DROP POLICY IF EXISTS "scorm_packages_insert" ON storage.objects;
CREATE POLICY "scorm_packages_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

DROP POLICY IF EXISTS "scorm_packages_update" ON storage.objects;
CREATE POLICY "scorm_packages_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
)
WITH CHECK (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

DROP POLICY IF EXISTS "scorm_packages_delete" ON storage.objects;
CREATE POLICY "scorm_packages_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

REVOKE ALL ON FUNCTION public.get_guest_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_course_guest_impl(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_course_guest(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_course(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_course_guest(uuid, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.can_assign_user_to_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_assign_user_to_group(uuid, uuid) TO authenticated;

COMMIT;

-- First super-admin bootstrap example:
-- 1. Create the user in Supabase Auth.
-- 2. Replace the placeholders below and run:
--
-- INSERT INTO public.organizations (id, name)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'Align')
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.profiles (id, org_id, email, full_name, role)
-- VALUES (
--   '<auth-user-id>',
--   '00000000-0000-0000-0000-000000000001',
--   'shahar.cohen@improve-it.co.il',
--   'מנהל על',
--   'super_admin'
-- );
