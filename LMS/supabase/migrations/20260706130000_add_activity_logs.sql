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

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx ON public.activity_logs (actor_id);
CREATE INDEX IF NOT EXISTS activity_logs_org_id_idx ON public.activity_logs (org_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON public.activity_logs (action);

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

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_super_admin_select" ON public.activity_logs;
CREATE POLICY "activity_logs_super_admin_select"
ON public.activity_logs FOR SELECT
TO authenticated
USING (public.is_super_admin());

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
