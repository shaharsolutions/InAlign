-- storage_setup.sql
-- Run this in the Supabase Dashboard SQL Editor to configure the storage bucket and RLS policies.

-- 1. Ensure the bucket 'scorm_packages' exists and is private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scorm_packages', 
  'scorm_packages', 
  false, 
  104857600, -- 100MB file size limit
  NULL -- Allow all mime types
)
ON CONFLICT (id) DO UPDATE SET public = false;


-- 2. Remove older broad/public policies before applying scoped policies.
DROP POLICY IF EXISTS "Allow public read access to scorm_packages" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload to scorm_packages" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update to scorm_packages" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete to scorm_packages" ON storage.objects;
DROP POLICY IF EXISTS "SCORM admins can read org package files" ON storage.objects;
DROP POLICY IF EXISTS "SCORM admins can upload org package files" ON storage.objects;
DROP POLICY IF EXISTS "SCORM admins can update org package files" ON storage.objects;
DROP POLICY IF EXISTS "SCORM admins can delete org package files" ON storage.objects;

-- 3. Helper condition:
-- SCORM object names are expected to start with org_<org_id>/courses/<course_id>/...
-- Edge Function scorm-asset reads through the service role, so learners do not need direct storage SELECT.

CREATE POLICY "SCORM admins can read org package files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

CREATE POLICY "SCORM admins can upload org package files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

CREATE POLICY "SCORM admins can update org package files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
)
WITH CHECK (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);

CREATE POLICY "SCORM admins can delete org package files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scorm_packages'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin', 'org_admin')
      AND (
        p.role = 'super_admin'
        OR regexp_replace((storage.foldername(name))[1], '^org_', '') = p.org_id::text
      )
  )
);
