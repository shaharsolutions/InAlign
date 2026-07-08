-- Allow the existing course catalog to host SCORM, video, PDF, and presentation content.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'scorm';

UPDATE public.courses
SET content_type = 'scorm'
WHERE content_type IS NULL OR content_type = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_content_type_check'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_content_type_check
      CHECK (content_type IN ('scorm', 'video', 'pdf', 'presentation'));
  END IF;
END;
$$;
