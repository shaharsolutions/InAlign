-- 1. Disable RLS entirely for existing tables
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.learner_progress DISABLE ROW LEVEL SECURITY;

-- 2. Drop EVERY existing policy to cleanly wipe the slate
DO $$ 
DECLARE r record;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 3. Re-enable RLS for existing tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.learner_progress ENABLE ROW LEVEL SECURITY;

-- 4. Create ONE simple, non-recursive policy per table (Only if the table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        EXECUTE 'CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT USING (auth.uid() = id)';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
        EXECUTE 'CREATE POLICY "orgs_select_all_auth" ON public.organizations FOR SELECT USING (auth.role() = ''authenticated'')';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'courses') THEN
        EXECUTE 'CREATE POLICY "courses_select_all_auth" ON public.courses FOR SELECT USING (auth.role() = ''authenticated'')';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_files') THEN
        EXECUTE 'CREATE POLICY "course_files_select_all_auth" ON public.course_files FOR SELECT USING (auth.role() = ''authenticated'')';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_assignments') THEN
        EXECUTE 'CREATE POLICY "course_assignments_select_self" ON public.course_assignments FOR SELECT USING (auth.uid() = user_id)';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'learner_progress') THEN
        EXECUTE 'CREATE POLICY "learner_progress_select_self" ON public.learner_progress FOR SELECT USING (auth.uid() = user_id)';
    END IF;
END $$;
