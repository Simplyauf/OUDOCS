-- 1. Profiles Table (Handles both Guests and Auth Users)
create table profiles (
  id uuid primary key default gen_random_uuid(), -- For guests, this is generated. For auth, this matches auth.uid()
  email text,
  full_name text,
  is_guest boolean default true,
  quota_used int default 0,
  quota_limit int default 2, -- Default 2 sessions for guests
  created_at timestamptz default now()
);

-- 2. Sessions Table (Scoped workspaces)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text default 'New Session',
  metadata jsonb default '{}'::jsonb, -- Store pages, chars count, file names
  created_at timestamptz default now()
);

-- 3. Update Documents Table (Link to Sessions)
-- We need to add session_id to the existing documents table
alter table documents 
add column session_id uuid references sessions(id) on delete cascade;

-- 4. Create Index for faster RAG filtering by session
create index idx_documents_session_id on documents(session_id);

-- 5. Updated Match Function (Now filters by session_id)
-- We drop the old one to be safe and recreate with the new signature
drop function if exists match_documents;

create or replace function match_documents (
  query_embedding vector(768), -- Using Gemini 768 dims
  match_threshold float,
  match_count int,
  filter_session_id uuid -- Critical: We MUST pass this to Isolate Data
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
    and session_id = filter_session_id -- Strict Scoping
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
-- 6. Sync session_id from metadata (to support LangChain/SupabaseVectorStore)
create or replace function public.sync_document_session_id()
returns trigger as $$
begin
  if new.session_id is null and (new.metadata->>'session_id') is not null then
    new.session_id := (new.metadata->>'session_id')::uuid;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sync_document_session_id_trigger
before insert on documents
for each row
execute function public.sync_document_session_id();

-- 7. Messages Table (Chat Persistence)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_messages_session_id on messages(session_id);

-- 8. Quota Management Functions
create or replace function decrement_quota(user_id_param uuid)
returns void as $$
begin
  update profiles
  set quota_used = greatest(0, quota_used - 1)
  where id = user_id_param;
end;
$$ language plpgsql;
