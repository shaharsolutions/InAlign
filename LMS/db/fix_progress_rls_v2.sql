-- Fix RLS Policies for learner_progress (v2)
-- Uses secure helper functions to avoid recursion and properly handle Admin access

-- 1. Ensure existing policies are removed to avoid overlaps
DROP POLICY IF EXISTS "org_admin_manage_progress" ON public.learner_progress;
DROP POLICY IF EXISTS "learner_manage_progress" ON public.learner_progress;
DROP POLICY IF EXISTS "super_admin_all_progress" ON public.learner_progress;
DROP POLICY IF EXISTS "Org Admins can view progress in their org" ON public.learner_progress;
DROP POLICY IF EXISTS "Learners can manage their own progress" ON public.learner_progress;

-- 2. Policy for Learners (Only their own progress)
CREATE POLICY "learner_manage_own_progress" ON public.learner_progress 
FOR ALL USING (
    user_id = auth.uid()
) WITH CHECK (
    user_id = auth.uid()
);

-- 3. Policy for Org Admins (Manage progress in their own organization)
CREATE POLICY "org_admin_manage_org_progress" ON public.learner_progress 
FOR ALL USING (
    public.get_my_role() = 'org_admin' 
    AND org_id = public.get_my_org()
) WITH CHECK (
    public.get_my_role() = 'org_admin' 
    AND org_id = public.get_my_org()
);

-- 4. Policy for Super Admins (Full access)
CREATE POLICY "super_admin_manage_all_progress" ON public.learner_progress 
FOR ALL USING (
    public.get_my_role() = 'super_admin'
) WITH CHECK (
    public.get_my_role() = 'super_admin'
);
