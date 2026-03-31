-- Enable RLS for organizations and ensure Super Admins can manage them
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 1. DROP old policies to avoid conflicts
DROP POLICY IF EXISTS "Super Admins can manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Anyone logged in can see organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can see their own org" ON public.organizations;

-- 2. CREATE robust policies

-- Policy for SELECT: Super admins see all, admins see their own, learners see theirs
CREATE POLICY "View Organizations" ON public.organizations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.role = 'super_admin' OR profiles.org_id = organizations.id)
        )
    );

-- Policy for ALL actions (Insert, Update, Delete): ONLY Super Admins
CREATE POLICY "Super Admins manage" ON public.organizations
    FOR ALL
    TO authenticated
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
