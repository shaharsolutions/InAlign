-- Drop problematic policies
DROP POLICY IF EXISTS "Admins can manage groups in their org" ON public.groups;
DROP POLICY IF EXISTS "Learners can see groups they belong to" ON public.groups;
DROP POLICY IF EXISTS "Admins can manage members" ON public.group_members;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.group_assignments;

-- Optimized Policies to avoid recursion

-- Groups: Use auth.jwt() for role check if possible, or direct profile check without nested joins
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

-- Group Members: Direct checks
CREATE POLICY "Admins manage group members" ON public.group_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'super_admin' 
                OR (
                    p.role = 'org_admin' 
                    AND p.org_id = (SELECT org_id FROM public.groups WHERE id = group_members.group_id)
                )
            )
        )
    );

-- Group Assignments: Direct checks
CREATE POLICY "Admins manage group assignments" ON public.group_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'super_admin' 
                OR (
                    p.role = 'org_admin' 
                    AND p.org_id = (SELECT org_id FROM public.groups WHERE id = group_assignments.group_id)
                )
            )
        )
    );
