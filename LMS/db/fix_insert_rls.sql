-- Grant INSERT and UPDATE access to organizations for authenticated users 
-- (Specifically needed for super_admin features)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
א
DROP POLICY IF EXISTS "orgs_insert_all_auth" ON public.organizations;
CREATE POLICY "orgs_insert_all_auth" ON public.organizations FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "orgs_update_all_auth" ON public.organizations;
CREATE POLICY "orgs_update_all_auth" ON public.organizations FOR UPDATE USING (auth.role() = 'authenticated');
