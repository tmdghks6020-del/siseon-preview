-- Admin-managed approved topics can be archived or removed from public use.
alter table public.topic_candidates
  add column if not exists archived_at timestamptz;

alter table public.topic_candidates
  drop constraint if exists topic_candidates_status_check;

alter table public.topic_candidates
  add constraint topic_candidates_status_check
  check (status in ('pending', 'approved', 'archived', 'rejected', 'not_selected', 'deleted'));

create index if not exists topic_candidates_public_status_idx
  on public.topic_candidates(status, decided_at desc)
  where status in ('approved', 'archived');
