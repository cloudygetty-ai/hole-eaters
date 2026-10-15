-- Allow the Power Top / Power Bottom roles added to the app (applied manually 2026-10-15)
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role is null or role in ('Top', 'Power Top', 'Bottom', 'Power Bottom', 'Versatile', 'Side', 'Curious'));
