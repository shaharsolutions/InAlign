-- הקשחת הרשאות הצפייה בלומדות - מעבר מהצגת הכל ברמת ארגון להצגה רק לפי שיוך לקבוצות/אישי
-- סקריפט זה מעדכן את ה-RLS של טבלת הקורסים.

-- 1. הסרת המדיניות הישנה והרחבה מדי
DROP POLICY IF EXISTS "Learners can view assigned & published courses in their org" ON public.courses;

-- 2. יצירת מדיניות בחירה (SELECT) חדשה ומדויקת ללומדים (Learners)
-- הערה: מנהלי על ומנהלי ארגון עדיין מכוסים על ידי המדיניות הקיימת שלהם.
CREATE POLICY "Learners can view assigned courses" ON public.courses
FOR SELECT
USING (
    published = true AND (
        -- 1. הקצאה דרך קבוצה
        EXISTS (
            SELECT 1 FROM public.group_assignments ga
            JOIN public.group_members gm ON ga.group_id = gm.group_id
            WHERE ga.course_id = public.courses.id AND gm.user_id = auth.uid()
        )
        OR
        -- 2. לשמור על גישה אם כבר יש לו רשומת התקדמות (למשל אם הוסר מהקבוצה אך כבר התחיל)
        EXISTS (
            SELECT 1 FROM public.learner_progress lp
            WHERE lp.course_id = public.courses.id AND lp.user_id = auth.uid()
        )
    )
);

-- 3. עדכון ה-RLS של טבלת הקצאות קבוצתיות כדי שלומד יוכל לראות את ההקצאות שלו
DROP POLICY IF EXISTS "View Group Assignments" ON public.group_assignments;
CREATE POLICY "View Group Assignments" ON public.group_assignments
    FOR SELECT
    USING ( 
        public.check_is_group_admin(group_id) 
        OR EXISTS (
            SELECT 1 FROM public.group_members m 
            WHERE m.group_id = group_assignments.group_id AND m.user_id = auth.uid()
        )
    );
