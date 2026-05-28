-- Add the Admin role while keeping Super Admin owner-only.
-- org_admin remains the organization-scoped training manager role.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'org_admin', 'learner'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_super_admin_owner_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_super_admin_owner_check
  CHECK (role <> 'super_admin' OR lower(email) = 'shaharsolutions@gmail.com');

CREATE UNIQUE INDEX IF NOT EXISTS one_super_admin_profile
  ON public.profiles ((role))
  WHERE role = 'super_admin';

CREATE OR REPLACE FUNCTION public.is_admin_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- Admin is a system role; org_admin is a training manager inside one organization.
  SELECT role_name IN ('admin', 'org_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_management_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT role_name IN ('super_admin', 'admin', 'org_admin');
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "profiles_org_admin_manage" ON public.profiles;
CREATE POLICY "profiles_org_admin_manage" ON public.profiles
  FOR ALL
  USING (
    public.is_admin_role(public.get_my_role())
    AND org_id = public.get_my_org_id()
    AND role <> 'super_admin'
  )
  WITH CHECK (
    public.is_admin_role(public.get_my_role())
    AND org_id = public.get_my_org_id()
    AND role = 'learner'
  );

DROP POLICY IF EXISTS "Org admins can update their own organization" ON public.organizations;
CREATE POLICY "Org admins can update their own organization" ON public.organizations
  FOR UPDATE
  USING (
    id = public.get_my_org_id()
    AND public.is_admin_role(public.get_my_role())
  )
  WITH CHECK (
    id = public.get_my_org_id()
    AND public.is_admin_role(public.get_my_role())
  );

DROP POLICY IF EXISTS "org_admin_manage_org_progress" ON public.learner_progress;
CREATE POLICY "org_admin_manage_org_progress" ON public.learner_progress
  FOR ALL
  USING (
    public.is_admin_role(public.get_my_role())
    AND org_id = public.get_my_org_id()
  )
  WITH CHECK (
    public.is_admin_role(public.get_my_role())
    AND org_id = public.get_my_org_id()
  );

DROP POLICY IF EXISTS "Org Admins can manage courses in their org" ON public.courses;
CREATE POLICY "Org Admins can manage courses in their org" ON public.courses
  FOR ALL
  USING (
    org_id = public.get_my_org_id()
    AND public.is_admin_role(public.get_my_role())
  )
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.is_admin_role(public.get_my_role())
  );

DROP POLICY IF EXISTS "Org Admins can manage files in their org" ON public.course_files;
CREATE POLICY "Org Admins can manage files in their org" ON public.course_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = course_files.course_id
        AND c.org_id = public.get_my_org_id()
        AND public.is_admin_role(public.get_my_role())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = course_files.course_id
        AND c.org_id = public.get_my_org_id()
        AND public.is_admin_role(public.get_my_role())
    )
  );

CREATE OR REPLACE FUNCTION public.check_is_group_admin(g_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE g.id = g_id
      AND (
        p.role = 'super_admin'
        OR (g.org_id = p.org_id AND public.is_admin_role(p.role))
      )
  );
$$;

DROP POLICY IF EXISTS "Admins can manage groups in their org" ON public.groups;
CREATE POLICY "Admins can manage groups in their org" ON public.groups
  FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (org_id = public.get_my_org_id() AND public.is_admin_role(public.get_my_role()))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (org_id = public.get_my_org_id() AND public.is_admin_role(public.get_my_role()))
  );
