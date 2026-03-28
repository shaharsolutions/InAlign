-- Make course categories organization-specific
ALTER TABLE public.course_categories ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Remove the previous global unique constraint on name
ALTER TABLE public.course_categories DROP CONSTRAINT IF EXISTS course_categories_name_key;

-- Add a new unique constraint per organization (including NULL for global)
-- Use a unique index that allows only one (name, org_id) or (name, NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_categories_org_name ON public.course_categories (name, org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_categories_global_name ON public.course_categories (name) WHERE org_id IS NULL;

-- Update RLS policies for per-organization categories
DROP POLICY IF EXISTS "Everyone can view categories" ON public.course_categories;
DROP POLICY IF EXISTS "Super Admins can manage categories" ON public.course_categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.course_categories;
DROP POLICY IF EXISTS "Super Admins manage all categories" ON public.course_categories;
DROP POLICY IF EXISTS "Org Admins manage their own categories" ON public.course_categories;
DROP POLICY IF EXISTS "Learners can view their org categories" ON public.course_categories;

-- Policy: Super Admins can see and manage EVERYTHING
CREATE POLICY "Super Admins manage all categories" ON public.course_categories
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policy: Org Admins can see and manage only their own categories
CREATE POLICY "Org Admins manage their own categories" ON public.course_categories
FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('org_admin', 'admin'))
) WITH CHECK (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Policy: Learners can see categories of their organization
CREATE POLICY "Learners can view their org categories" ON public.course_categories
FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);
