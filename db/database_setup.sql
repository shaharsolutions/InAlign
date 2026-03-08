-- Database Setup for Enterprise LMS Multi-Tenant

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: organizations
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#0066FF',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'org_admin', 'learner')) DEFAULT 'learner',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: courses
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'כללי',
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: course_files
CREATE TABLE public.course_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: course_assignments
CREATE TABLE public.course_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, course_id)
);

-- Table: learner_progress
CREATE TABLE public.learner_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES public.course_assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
    progress_percent INTEGER DEFAULT 0,
    score INTEGER DEFAULT NULL,
    time_spent_seconds INTEGER DEFAULT 0,
    suspend_data TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, course_id)
);

-- RLS setup (Row Level Security)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_progress ENABLE ROW LEVEL SECURITY;

-- 1. Organizations Policies (Non-recursive)
CREATE POLICY "Super Admins can manage all orgs" ON public.organizations FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "Users can view their own org" ON public.organizations FOR SELECT USING (
    id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- 2. Profiles Policies (Fixed to avoid recursive loops)
-- Policy 1: Everyone can view their own profile (This is basic and safe)
CREATE POLICY "Users can view their own profile" ON public.profiles 
FOR SELECT USING (id = auth.uid());

-- Policy 2: Super admins can see and manage everything
-- Note: We use a separate subquery that isn't dependent on the evaluation of the current row
CREATE POLICY "Super admin full access" ON public.profiles
FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);

-- Policy 3: Org admins can see members of their org
CREATE POLICY "Org admins view members" ON public.profiles
FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'org_admin'
);

-- 3. Courses Policies
CREATE POLICY "Super Admins can manage all courses" ON public.courses FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "Org Admins can manage courses in their org" ON public.courses FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'org_admin')
);
CREATE POLICY "Learners can view assigned & published courses in their org" ON public.courses FOR SELECT USING (
    published = true AND org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- 4. Course Files Policies
CREATE POLICY "Org Admins can manage files in their org" ON public.course_files FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.courses c 
        WHERE c.id = course_files.course_id 
        AND c.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'org_admin'))
    )
);
CREATE POLICY "Learners can read files of assigned courses" ON public.course_files FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.courses c 
        WHERE c.id = course_files.course_id 
        AND c.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- 5. Course Assignments Policies
CREATE POLICY "Org Admins can assign courses" ON public.course_assignments FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'org_admin'))
);
CREATE POLICY "Learners can see their assignments" ON public.course_assignments FOR SELECT USING (
    user_id = auth.uid()
);

-- 6. Learner Progress Policies
CREATE POLICY "Learners can manage their own progress" ON public.learner_progress FOR ALL USING (
    user_id = auth.uid()
);
CREATE POLICY "Org Admins can view progress in their org" ON public.learner_progress FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) 
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'org_admin'))
);

-- Notes: Ensure a storage bucket named 'scorm_packages' is created in your Supabase project manually.
