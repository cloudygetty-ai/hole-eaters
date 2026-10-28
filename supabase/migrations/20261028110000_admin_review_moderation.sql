-- Admin queue for reviews flagged by the person reviewed.
-- Admins see who wrote each review (to act on abusers); regular users never do.

create or replace function public.admin_flagged_reviews()
returns table (id uuid, met text, rating smallint, tags text[], body text, created_at timestamptz,
               reviewer_id uuid, reviewer_name text, reviewee_id uuid, reviewee_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return query
    select r.id, r.met, r.rating, r.tags, r.body, r.updated_at,
           r.reviewer_id, rp.name, r.reviewee_id, tp.name
    from reviews r
    left join profiles rp on rp.id = r.reviewer_id
    left join profiles tp on tp.id = r.reviewee_id
    where r.flagged and not r.hidden
    order by r.updated_at;
end $$;

-- hide = true removes it from the profile and the flake scale; false keeps it and clears the flag
create or replace function public.admin_moderate_review(review uuid, hide boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update reviews set hidden = hide, flagged = false where id = review;
  insert into admin_log (admin_id, action, target_type, target_id, metadata)
  values (auth.uid(), case when hide then 'hide_review' else 'keep_review' end, 'review', review, '{}'::jsonb);
end $$;

grant execute on function public.admin_flagged_reviews(), public.admin_moderate_review(uuid, boolean) to authenticated;
revoke execute on function public.admin_flagged_reviews(), public.admin_moderate_review(uuid, boolean) from public, anon;

-- Getty's account (cloudygetty@gmail.com) is an admin
insert into public.admin_users (user_id) values ('6057324f-ca95-4f87-b5a6-9e5fcd3fe8eb') on conflict do nothing;
