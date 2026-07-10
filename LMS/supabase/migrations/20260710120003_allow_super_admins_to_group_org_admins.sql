-- A super admin may include organization-scoped managers in that
-- organization's groups. Other managers remain limited to learners.

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
        AND (
          p.role = 'learner'
          OR (
            public.current_profile_role() = 'super_admin'
            AND p.role IN ('admin', 'org_admin')
          )
        )
    );
$$;
