DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.current_profile_role() IN ('admin', 'org_admin')
    AND org_id = public.current_profile_org_id()
    AND (
      role = 'learner'
      OR (public.current_profile_role() = 'admin' AND role = 'org_admin')
    )
  )
);
