-- 1. Fix the Cascade Delete problem on Profiles
-- Profiles should NOT be deleted if their organization is deleted. 
-- Instead, their org_id should be set to NULL.

ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_org_id_fkey 
FOREIGN KEY (org_id) 
REFERENCES organizations(id) 
ON DELETE SET NULL;

-- 2. Ensure Super Admins can manage Organizations
-- (Fixing potential 403 on Create/Update/Delete)

-- First, ensure RLS is enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid conflicts
DROP POLICY IF EXISTS "Super Admins can manage all orgs" ON public.organizations;
DROP POLICY IF EXISTS "Super Admins manage" ON public.organizations;
DROP POLICY IF EXISTS "Enable view for orgs" ON public.organizations;
DROP POLICY IF EXISTS "View Organizations" ON public.organizations;
DROP POLICY IF EXISTS "Anyone logged in can see organizations" ON public.organizations;

-- Create robust policies using the security definer functions if they exist
-- Or use non-recursive checks

-- SELECT: Authenticated users can view organizations (required for joining/profile load)
CREATE POLICY "orgs_select_all" ON public.organizations
    FOR SELECT TO authenticated USING (true);

-- ALL: Only super admins can Insert/Update/Delete
-- We use a subquery to profiles. Note: profiles has a policy to allow self-select, 
-- but we should use get_my_role() if available to be even safer.
CREATE POLICY "orgs_super_admin_manage" ON public.organizations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'super_admin'
        )
    );
