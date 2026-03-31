-- 1. Create a helper function to break recursion
-- SECURITY DEFINER runs with the privileges of the creator (usually postgres/service_role), bypassing RLS
CREATE OR REPLACE FUNCTION public.check_is_group_admin(g_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.groups g ON g.org_id = p.org_id
    WHERE p.id = auth.uid()
    AND g.id = g_id
    AND (p.role = 'org_admin' OR p.role = 'super_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop all previous matching policies
DROP POLICY IF EXISTS "Admins can manage groups in their org" ON public.groups;
DROP POLICY IF EXISTS "Learners can see groups they belong to" ON public.groups;
DROP POLICY IF EXISTS "Admins manage group members" ON public.group_members;
DROP POLICY IF EXISTS "Admins manage group assignments" ON public.group_assignments;
DROP POLICY IF EXISTS "Admins manage members" ON public.group_members;
DROP POLICY IF EXISTS "Admins manage assignments" ON public.group_assignments;

-- 3. Simplified Policies for Groups (No recursion)
CREATE POLICY "Manage Groups" ON public.groups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() 
            AND (p.role = 'super_admin' OR (p.org_id = groups.org_id AND p.role = 'org_admin'))
        )
    );

CREATE POLICY "View My Groups" ON public.groups
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members m
            WHERE m.group_id = groups.id AND m.user_id = auth.uid()
        )
    );

-- 4. Simplified Policies for Group Members (Using the helper function to avoid recursion)
CREATE POLICY "Manage Members" ON public.group_members
    FOR ALL
    USING ( public.check_is_group_admin(group_id) );

CREATE POLICY "View My Membership" ON public.group_members
    FOR SELECT
    USING ( user_id = auth.uid() );

-- 5. Simplified Policies for Group Assignments
CREATE POLICY "Manage Group Assignments" ON public.group_assignments
    FOR ALL
    USING ( public.check_is_group_admin(group_id) );

CREATE POLICY "View Group Assignments" ON public.group_assignments
    FOR SELECT
    USING ( public.check_is_group_admin(group_id) OR EXISTS (
        SELECT 1 FROM public.group_members m 
        WHERE m.group_id = group_assignments.group_id AND m.user_id = auth.uid()
    ));
