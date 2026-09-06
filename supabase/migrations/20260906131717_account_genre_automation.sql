-- Account-scoped Rakuten genres and staged automation.
-- Existing accounts stay in semi-automatic mode to avoid surprise publishing.

alter table public.threads_accounts
  add column if not exists genre_id bigint,
  add column if not exists operation_mode text not null default 'semi_auto';

alter table public.threads_accounts
  add constraint threads_accounts_genre_id_positive
    check (genre_id is null or genre_id > 0),
  add constraint threads_accounts_operation_mode_check
    check (operation_mode in ('semi_auto', 'auto'));

update public.threads_accounts
set genre_id = case trim(genre)
  when '美容' then 100939
  when '美容・コスメ・香水' then 100939
  when 'ダイエット・健康' then 100938
  when '食品' then 100227
  when 'スイーツ・お菓子' then 551167
  when '家電' then 562637
  when 'パソコン・周辺機器' then 100026
  when 'スマートフォン・タブレット' then 564500
  when 'インテリア・寝具・収納' then 100804
  when '日用品雑貨・文房具・手芸' then 215783
  when 'キッチン用品・食器・調理器具' then 558944
  when 'レディースファッション' then 100371
  when 'メンズファッション' then 551177
  when 'キッズ・ベビー・マタニティ' then 100533
  when 'スポーツ・アウトドア' then 101070
  when 'ペット・ペットグッズ' then 101213
  else genre_id
end
where genre_id is null;

create index if not exists threads_accounts_genre_mode_idx
  on public.threads_accounts (genre_id, operation_mode)
  where status = 'active';
