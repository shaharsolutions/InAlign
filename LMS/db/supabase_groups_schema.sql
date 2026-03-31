-- Create Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Group Members Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- Create Group Assignments Table (Which courses are assigned to which groups)
CREATE TABLE IF NOT EXISTS public.group_assignments (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, course_id)
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for Groups
CREATE POLICY "Admins can manage groups in their org" ON public.groups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'super_admin' OR (profiles.org_id = groups.org_id AND profiles.role = 'org_admin'))
        )
    );

CREATE POLICY "Learners can see groups they belong to" ON public.groups
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = groups.id
            AND group_members.user_id = auth.uid()
        )
    );

-- Policies for Group Members
CREATE POLICY "Admins can manage members" ON public.group_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.groups g ON g.id = group_members.group_id
            WHERE p.id = auth.uid()
            AND (p.role = 'super_admin' OR (p.org_id = g.org_id AND p.role = 'org_admin'))
        )
    );

-- Policies for Group Assignments
CREATE POLICY "Admins can manage assignments" ON public.group_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.groups g ON g.id = group_assignments.group_id
            WHERE p.id = auth.uid()
            AND (p.role = 'super_admin' OR (p.org_id = g.org_id AND p.role = 'org_admin'))
        )
    );
