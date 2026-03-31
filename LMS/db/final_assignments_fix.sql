-- ==========================================
-- FINAL FIX: COURSE ASSIGNMENTS SCHEMA (ORG-LEVEL)
-- ==========================================
-- This script fixes the "null value in column user_id violates not-null constraint" 
-- by migrating course_assignments to be per-organization instead of per-user.

BEGIN;

-- 1. DROP old table and recreate (Clean slate for assignments)
DROP TABLE IF EXISTS public.course_assignments CASCADE;

CREATE TABLE public.course_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(course_id, org_id)
);

-- 2. Restore RLS
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can manage all assignments" ON public.course_assignments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Org Admins can manage their org assignments" ON public.course_assignments FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY "Learners can see their org assignments" ON public.course_assignments FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
);

-- 3. FIX AUTO-ENROLL TRIGGER (Remove user_id dependency)
CREATE OR REPLACE FUNCTION public.handle_auto_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    target_ids UUID[];
    cid UUID;
BEGIN
    -- Get the array of course IDs for the user's organization
    SELECT auto_enroll_course_ids INTO target_ids 
    FROM public.organizations 
    WHERE id = NEW.org_id;

    -- If a list is set, assign all courses to the new user in learner_progress ONLY
    IF target_ids IS NOT NULL AND array_length(target_ids, 1) > 0 THEN
        FOREACH cid IN ARRAY target_ids
        LOOP
            -- Insert into learner_progress (which drives the dashboard)
            INSERT INTO public.learner_progress (org_id, user_id, course_id, status, progress_percent)
            VALUES (NEW.org_id, NEW.id, cid, 'not_started', 0)
            ON CONFLICT (user_id, course_id) DO NOTHING;
            
            -- NOTE: We no longer insert into course_assignments here because 
            -- course_assignments is now shared for the whole organization.
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
