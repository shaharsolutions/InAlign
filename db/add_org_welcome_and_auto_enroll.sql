-- Add welcome message and auto-enrollment columns to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS auto_enroll_course_id;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS auto_enroll_course_ids UUID[] DEFAULT '{}';

-- Comment for clarity
COMMENT ON COLUMN public.organizations.welcome_message IS 'A custom welcome message displayed to learners on their dashboard.';
COMMENT ON COLUMN public.organizations.auto_enroll_course_ids IS 'An array of course IDs that new users in this organization will be automatically assigned.';

-- PostgreSQL Function for Auto-Enrollment (Updated for Arrays)
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

    -- If a list is set, assign all courses to the new user
    IF target_ids IS NOT NULL AND array_length(target_ids, 1) > 0 THEN
        FOREACH cid IN ARRAY target_ids
        LOOP
            -- Insert into learner_progress (which drives the dashboard)
            INSERT INTO public.learner_progress (org_id, user_id, course_id, status, progress_percent)
            VALUES (NEW.org_id, NEW.id, cid, 'not_started', 0)
            ON CONFLICT (user_id, course_id) DO NOTHING;
            
            -- Also insert into course_assignments for admin tracking
            INSERT INTO public.course_assignments (org_id, user_id, course_id, assigned_at)
            VALUES (NEW.org_id, NEW.id, cid, now())
            ON CONFLICT (user_id, course_id) DO NOTHING;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Run after every new profile is created or updated (to catch upserts/changes)
DROP TRIGGER IF EXISTS on_profile_created_enroll ON public.profiles;
CREATE TRIGGER on_profile_created_enroll
    AFTER INSERT OR UPDATE OF org_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_auto_enrollment();
