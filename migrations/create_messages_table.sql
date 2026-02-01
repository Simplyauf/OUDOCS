-- Create messages table for chat persistence
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Create index for faster retrieval
create index if not exists idx_messages_session_id on messages(session_id);
