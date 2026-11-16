-- Open the next-drop vote, keeping Batman exclusively as the current commercial drop.
-- Votes already cast for Love in Darkness are preserved but excluded from the live ranking.
do $$
begin
  if to_regclass('public.drop_announcement_history') is null
     or to_regclass('public.drop_settings') is null
     or to_regclass('public.creations') is null then
    raise exception 'Apply the Love&Faith vote and drops migrations before opening voting.';
  end if;
  if not exists (select 1 from public.creations where slug = 'batman-drop-01')
     or not exists (select 1 from public.creations where slug = 'love-in-darkness') then
    raise exception 'Seed Batman and Love in Darkness before opening voting.';
  end if;
  if not exists (select 1 from public.drop_settings where id = 1) then
    raise exception 'The drop_settings row (id = 1) is missing.';
  end if;
end $$;

insert into public.drop_announcement_history (drop_name, winner_slug, announced_at)
select d.drop_name, c.slug, coalesce(d.winner_announced_at, d.updated_at, now())
from public.drop_settings d
join public.creations c on c.id = d.winner_creation_id
where d.id = 1
on conflict do nothing;

update public.creations
set is_candidate = false,
    status = 'preparing',
    vote_status = null
where slug = 'love-in-darkness';

-- Move any prior announced winner back to the closed-candidate state before reopening.
update public.creations
set vote_status = 'voting_closed'
where is_candidate and vote_status = 'selected';

update public.drop_settings
set vote_status = 'open',
    opens_at = coalesce(opens_at, now()),
    closes_at = null,
    winner_creation_id = null,
    winner_announced_at = null
where id = 1;

update public.creations
set vote_status = 'voting_open'
where is_candidate and status = 'candidate'
  and vote_status in ('candidate', 'voting_closed');
