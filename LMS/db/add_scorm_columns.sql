-- Add lesson_location and ensure suspend_data exists for SCORM support
ALTER TABLE public.learner_progress 
ADD COLUMN IF NOT EXISTS lesson_location TEXT,
ADD COLUMN IF NOT EXISTS suspend_data TEXT;

-- Refresh schema cache reminder:
-- If you still see "column not found" errors, you may need to reload the Supabase dashboard
-- or wait a few minutes for the PostgREST cache to refresh.
