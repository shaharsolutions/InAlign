-- Close tenant-boundary escalation paths before organizational rollout.
-- Profile role, organization, and email changes are performed only by the
-- service-role Edge Functions; browser clients may update only their name
-- and phone number.

DO $$
DECLARE
  policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
  END LOOP;
END $$;

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

DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
CREATE POLICY "organizations_select_authenticated"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_super_admin() OR id = public.current_profile_org_id());

DROP POLICY IF EXISTS "scorm_packages_select" ON storage.objects;
CREATE POLICY "scorm_packages_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
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
