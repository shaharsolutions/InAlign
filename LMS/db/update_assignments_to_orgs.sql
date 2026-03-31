-- Update assignments to be per-organization instead of per-user
DROP TABLE IF EXISTS public.course_assignments CASCADE;

CREATE TABLE public.course_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(course_id, org_id)
);

ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can manage org assignments" ON public.course_assignments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Users can see their org assignments" ON public.course_assignments FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
);

ALTER TABLE public.learner_progress DROP CONSTRAINT IF EXISTS learner_progress_assignment_id_fkey;
ALTER TABLE public.learner_progress DROP COLUMN IF EXISTS assignment_id;
