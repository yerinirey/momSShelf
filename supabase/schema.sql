-- =====================================================
-- 엄마만의 서재 · Supabase Schema
-- SQL Editor에 통째로 붙여넣어 실행
-- =====================================================

-- 1. books 테이블
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title       text not null,
  author      text,                -- 소설=작가, 영화=감독
  type        text not null check (type in ('novel','movie')),
  year        int,
  html_path   text not null,       -- Storage 내 경로 (예: books/<id>.html)
  cover_config jsonb,              -- {spineColor, accentColor, pattern, ...}
  summary     text,                -- 짧은 요약 (홈 hover 표시용)
  owner_id    uuid references auth.users(id),
  created_at  timestamptz default now()
);

create index if not exists books_created_at_idx on public.books (created_at desc);
create index if not exists books_type_idx on public.books (type);

-- 2. Row Level Security
alter table public.books enable row level security;

-- 누구나 읽기 가능
drop policy if exists "books_read_all" on public.books;
create policy "books_read_all"
  on public.books for select
  using (true);

-- insert/update/delete는 본인만 (owner_id = auth.uid())
drop policy if exists "books_insert_owner" on public.books;
create policy "books_insert_owner"
  on public.books for insert
  with check (auth.uid() = owner_id);

drop policy if exists "books_update_owner" on public.books;
create policy "books_update_owner"
  on public.books for update
  using (auth.uid() = owner_id);

drop policy if exists "books_delete_owner" on public.books;
create policy "books_delete_owner"
  on public.books for delete
  using (auth.uid() = owner_id);

-- 3. Storage bucket: 'books' (public read)
insert into storage.buckets (id, name, public)
values ('books', 'books', true)
on conflict (id) do nothing;

-- Storage 정책: 누구나 읽기, 인증 사용자만 쓰기
drop policy if exists "books_storage_read" on storage.objects;
create policy "books_storage_read"
  on storage.objects for select
  using (bucket_id = 'books');

drop policy if exists "books_storage_write" on storage.objects;
create policy "books_storage_write"
  on storage.objects for insert
  with check (bucket_id = 'books' and auth.role() = 'authenticated');
