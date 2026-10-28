-- Reviews + flake scale. Replaces the old Vibe check UI.
-- Rules: you can only review someone you've actually chatted with (both sent a message),
-- one review per person (editable), reviewer identity is never exposed to other users.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  -- Flake signal: did the meetup happen?
  met text not null check (met in ('showed', 'late', 'flaked', 'chat_only')),
  rating smallint check (rating between 1 and 5),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 6 and tags <@ array[
      'As pictured', 'Hot', 'Clean', 'Respectful', 'Great host', 'Knows what he''s doing', 'Down to earth',
      'Not as pictured', 'Rude', 'Pushy', 'Bad hygiene', 'Ghosted'
    ]::text[]
  ),
  -- Short, and no links or phone numbers so reviews can't be used to dox anyone
  body text check (
    body is null or (char_length(body) <= 200
      and body !~* '(https?://|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})')
  ),
  flagged boolean not null default false, -- reviewee asked a mod to look at it
  hidden boolean not null default false,  -- set by a mod; hidden reviews don't count
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id),
  -- A no-show can't be rated on how the hookup went
  check (met <> 'flaked' or rating is null),
  check (met = 'flaked' or rating is not null)
);
create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id) where not hidden;

alter table public.reviews enable row level security;

-- I and the other person both sent at least one message in a shared chat.
-- Scoped to auth.uid() so nobody can probe who else has been talking.
create or replace function public.chatted_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from matches m
    where ((m.user_a = auth.uid() and m.user_b = other) or (m.user_a = other and m.user_b = auth.uid()))
      and exists (select 1 from messages x where x.match_id = m.id and x.sender_id = auth.uid())
      and exists (select 1 from messages x where x.match_id = m.id and x.sender_id = other)
  )
$$;

create policy reviews_select_own on public.reviews for select to authenticated
  using (reviewer_id = auth.uid());
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and reviewee_id <> auth.uid() and public.chatted_with(reviewee_id)
    and flagged = false and hidden = false);
create policy reviews_update_own on public.reviews for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (reviewer_id = auth.uid());

-- Reviewers can edit their words, not who it's about or the moderation flags
create or replace function public.reviews_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.reviewee_id is distinct from old.reviewee_id or new.reviewer_id is distinct from old.reviewer_id
       or new.hidden is distinct from old.hidden or new.flagged is distinct from old.flagged
       or new.created_at is distinct from old.created_at then
      raise exception 'only the review itself can be edited' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reviews_guard before update on public.reviews for each row execute function public.reviews_guard();

grant select, insert, update, delete on public.reviews to authenticated;

-- Public read path: no reviewer ids, hidden reviews excluded
create or replace function public.get_reviews(target uuid, max_rows int default 30)
returns table (id uuid, met text, rating smallint, tags text[], body text, created_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.met, r.rating, r.tags, r.body, r.updated_at, r.reviewer_id = auth.uid()
  from reviews r
  where r.reviewee_id = target and not r.hidden
  order by r.updated_at desc
  limit least(greatest(max_rows, 1), 100)
$$;

-- Flake scale: flakes count fully, lateness counts half, over meetups that were planned
create or replace function public.get_review_summary(target uuid)
returns table (review_count int, avg_rating numeric, meetups int, showed int, late int, flaked int, flake_rate numeric, can_review boolean)
language sql stable security definer set search_path = public as $$
  select
    count(*)::int,
    round(avg(r.rating), 1),
    count(*) filter (where r.met <> 'chat_only')::int,
    count(*) filter (where r.met = 'showed')::int,
    count(*) filter (where r.met = 'late')::int,
    count(*) filter (where r.met = 'flaked')::int,
    case when count(*) filter (where r.met <> 'chat_only') = 0 then null
         else round((count(*) filter (where r.met = 'flaked') + 0.5 * count(*) filter (where r.met = 'late'))::numeric
                    / count(*) filter (where r.met <> 'chat_only'), 2) end,
    auth.uid() is not null and auth.uid() <> target and public.chatted_with(target)
  from reviews r
  where r.reviewee_id = target and not r.hidden
$$;

-- The person reviewed can send a review to the mods; it stays up until a mod decides
create or replace function public.flag_review(review uuid) returns void
language sql security definer set search_path = public as $$
  update reviews set flagged = true where id = review and reviewee_id = auth.uid()
$$;

grant execute on function public.get_reviews(uuid, int), public.get_review_summary(uuid), public.flag_review(uuid) to authenticated;
grant execute on function public.chatted_with(uuid) to authenticated;

-- Close the old vibe_checks hole: the rated person could edit/delete their scores and forge new ones.
create policy vibes_writer_only on public.vibe_checks as restrictive for all to authenticated
  using (from_user = auth.uid()) with check (from_user = auth.uid());

-- Reviews are for signed-in members only
revoke execute on function public.get_reviews(uuid, int), public.get_review_summary(uuid), public.flag_review(uuid), public.chatted_with(uuid) from public, anon;
