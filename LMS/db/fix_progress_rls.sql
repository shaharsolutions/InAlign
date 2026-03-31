-- Fix RLS Policies for learner_progress
-- Allows Admins to delete and manage progress, and Learners to save their own

-- 1. Enable deleting by Org Admins for their own organization
CREATE POLICY "org_admin_manage_progress" ON public.learner_progress 
FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'org_admin'
);

-- 2. Enable saving and managing own progress for Learners
CREATE POLICY "learner_manage_progress" ON public.learner_progress 
FOR ALL USING (
    user_id = auth.uid()
);

-- 3. Super admin access
CREATE POLICY "super_admin_all_progress" ON public.learner_progress 
FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);
