-- In-app account deletion (App Store guideline 5.1.1(v)).
-- Deletes the caller's auth user; words, learner_profile and user_providers
-- all reference auth.users(id) ON DELETE CASCADE, so their rows go with it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.email_otps where email = (select email from auth.users where id = uid);
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
