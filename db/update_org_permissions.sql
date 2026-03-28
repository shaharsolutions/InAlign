-- Allow Org Admins to update their own organization settings
DROP POLICY IF EXISTS "Org admins can update their own organization" ON public.organizations;

CREATE POLICY "Org admins can update their own organization" ON public.organizations 
FOR UPDATE USING (
    id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('org_admin', 'admin'))
) WITH CHECK (
    id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Note: Super admins still can update everything via their existing "Super admins can manage organizations" policy.
