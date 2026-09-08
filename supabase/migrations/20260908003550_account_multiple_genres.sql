-- Allow each Threads account to target multiple Rakuten genres.
-- genre/genre_id remain as the primary genre for backward compatibility.

alter table public.threads_accounts
  add column if not exists genres text[] not null default '{}'::text[],
  add column if not exists genre_ids bigint[] not null default '{}'::bigint[];

update public.threads_accounts
set genres = case when genre_id is not null then array[genre] else '{}'::text[] end,
    genre_ids = case when genre_id is not null then array[genre_id] else '{}'::bigint[] end
where cardinality(genre_ids) = 0;

alter table public.threads_accounts
  add constraint threads_accounts_genres_same_length
    check (cardinality(genres) = cardinality(genre_ids)),
  add constraint threads_accounts_genre_ids_positive
    check (
      cardinality(genre_ids) between 1 and 31
      and array_position(genre_ids, null) is null
      and 0 < all(genre_ids)
    );

create index if not exists threads_accounts_genre_ids_idx
  on public.threads_accounts using gin (genre_ids)
  where status = 'active';
