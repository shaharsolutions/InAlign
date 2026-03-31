-- Create table for course categories
CREATE TABLE IF NOT EXISTS public.course_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Everyone can view categories" ON public.course_categories;
CREATE POLICY "Everyone can view categories" ON public.course_categories 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super Admins can manage categories" ON public.course_categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.course_categories;
CREATE POLICY "Admins can manage categories" ON public.course_categories 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'org_admin', 'admin'))
);

-- Insert default categories
INSERT INTO public.course_categories (name)
VALUES ('כללי'), ('אבטחת מידע'), ('משאבי אנוש'), ('טכנולוגיה')
ON CONFLICT (name) DO NOTHING;
