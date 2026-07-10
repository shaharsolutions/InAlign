-- Let an organization access courses explicitly shared with it through
-- course_assignments, without granting it ownership or edit rights.

DROP POLICY IF EXISTS "courses_select" ON public.courses;
CREATE POLICY "courses_select"
ON public.courses FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR org_id = public.current_profile_org_id()
  OR EXISTS (
    SELECT 1
    FROM public.course_assignments assignment
    WHERE assignment.course_id = courses.id
      AND assignment.org_id = public.current_profile_org_id()
  )
);

DROP POLICY IF EXISTS "course_files_select" ON public.course_files;
CREATE POLICY "course_files_select"
ON public.course_files FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_files.course_id
      AND (
        public.is_super_admin()
        OR c.org_id = public.current_profile_org_id()
        OR EXISTS (
          SELECT 1
          FROM public.course_assignments assignment
          WHERE assignment.course_id = c.id
            AND assignment.org_id = public.current_profile_org_id()
        )
      )
  )
);
