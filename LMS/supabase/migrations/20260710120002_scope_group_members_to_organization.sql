-- A group can contain only learners belonging to the group's organization.
-- Super admins retain management access, but cannot accidentally create a
-- cross-organization group membership.

CREATE OR REPLACE FUNCTION public.can_assign_user_to_group(
  target_group_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.can_manage_group(target_group_id)
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      JOIN public.profiles p ON p.id = target_user_id
      WHERE g.id = target_group_id
        AND p.org_id = g.org_id
        AND p.role = 'learner'
    );
$$;

REVOKE ALL ON FUNCTION public.can_assign_user_to_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_assign_user_to_group(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "group_members_manage" ON public.group_members;
CREATE POLICY "group_members_manage"
ON public.group_members FOR ALL
TO authenticated
USING (public.can_manage_group(group_id))
WITH CHECK (public.can_assign_user_to_group(group_id, user_id));
