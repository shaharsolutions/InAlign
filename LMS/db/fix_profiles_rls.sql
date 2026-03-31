-- התיקון הקודם גרם לרקורסיה אינסופית (Error 500) בגלל תתי-שאילתות בתוך ה-RLS
-- הסקריפט הזה מחליף את המדיניות הקיימת בפונקציות עזר מאובטחות (Security Definer) שעוקפות את ה-RLS

-- 1. יצירת פונקציות עזר להוצאת תפקיד וארגון ללא רקורסיה
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  -- פונקציה זו רצה כ-Postgres (Security Definer) ולכן לא מפעילה RLS של הטבלה
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. ניקוי מדיניות קודמת
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_super_admin_manage" ON public.profiles;
DROP POLICY IF EXISTS "profiles_org_admin_manage" ON public.profiles;
DROP POLICY IF EXISTS "Super admin full access" ON public.profiles;
DROP POLICY IF EXISTS "Org admins view members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- 3. יצירת מדיניות חדשה ובטוחה (ללא רקורסיה)

-- כל משתמש רשאי לראות את עצמו
CREATE POLICY "profiles_select_self" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- מנהל על רשאי לעשות הכל (משתמש בפונקציה שעוקפת RLS)
CREATE POLICY "profiles_super_admin_manage" ON public.profiles
    FOR ALL
    USING ( public.get_my_role() = 'super_admin' )
    WITH CHECK ( public.get_my_role() = 'super_admin' );

-- מנהל ארגון רשאי לנהל משתמשים רק בארגון שלו
CREATE POLICY "profiles_org_admin_manage" ON public.profiles
    FOR ALL
    USING ( 
        public.get_my_role() = 'org_admin' 
        AND org_id = public.get_my_org() 
    )
    WITH CHECK ( 
        public.get_my_role() = 'org_admin' 
        AND org_id = public.get_my_org() 
    );
