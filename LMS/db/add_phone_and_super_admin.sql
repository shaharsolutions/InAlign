-- 1. נוסיף את העמודה טלפון לטבלת הפרופילים
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. נהפוך את shaharsolutions@gmail.com לסופר אדמין!
UPDATE public.profiles 
SET role = 'super_admin' 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'shaharsolutions@gmail.com'
);
