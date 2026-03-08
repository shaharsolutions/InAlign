-- 1. Disable RLS temporarily
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- 2. Drop the specific policies causing the conflict
DROP POLICY IF EXISTS "Enable read access for standard user" ON public.profiles;
DROP POLICY IF EXISTS "Enable view for orgs" ON public.organizations;

-- 3. Recreate the simple policies
CREATE POLICY "Enable read access for standard user" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Enable view for orgs" 
ON public.organizations FOR SELECT 
USING (auth.role() = 'authenticated');

-- 4. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
