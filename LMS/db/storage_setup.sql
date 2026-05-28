-- storage_setup.sql
-- Run this in the Supabase Dashboard SQL Editor to configure the storage bucket and RLS policies.

-- 1. Ensure the bucket 'scorm_packages' exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scorm_packages', 
  'scorm_packages', 
  true, 
  104857600, -- 100MB file size limit
  NULL -- Allow all mime types
)
ON CONFLICT (id) DO UPDATE SET public = true;


-- 3. Policy: Allow public read access to 'scorm_packages' bucket
CREATE POLICY "Allow public read access to scorm_packages"
ON storage.objects FOR SELECT
USING (bucket_id = 'scorm_packages');

-- 4. Policy: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated upload to scorm_packages"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scorm_packages');

-- 5. Policy: Allow authenticated users to update files
CREATE POLICY "Allow authenticated update to scorm_packages"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'scorm_packages');

-- 6. Policy: Allow authenticated users to delete files
CREATE POLICY "Allow authenticated delete to scorm_packages"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'scorm_packages');
