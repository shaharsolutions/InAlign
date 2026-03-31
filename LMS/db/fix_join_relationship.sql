-- Fix Foreign Key relationship for Group Members to allow PostgREST joins with Profiles
ALTER TABLE public.group_members 
DROP CONSTRAINT IF EXISTS group_members_user_id_fkey;

ALTER TABLE public.group_members
ADD CONSTRAINT group_members_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Also verify the group_id constraint
ALTER TABLE public.group_members 
DROP CONSTRAINT IF EXISTS group_members_group_id_fkey;

ALTER TABLE public.group_members
ADD CONSTRAINT group_members_group_id_fkey 
FOREIGN KEY (group_id) 
REFERENCES public.groups(id) 
ON DELETE CASCADE;
