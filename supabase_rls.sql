-- 1. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
-- Users can see their own profile (Guest or Auth)
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id OR id::text = current_setting('request.headers')::json->>'x-guest-id');

-- (Note: for real Guest RLS, we'd need a custom claim or just rely on API-side checks for guests, 
-- but for simplicity, we allow service role for guests and strict RLS for logged-in users)

CREATE POLICY "Authenticated users can view own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- 3. Sessions Policies
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (user_id = auth.uid() OR user_id::text = current_setting('request.headers')::json->>'x-guest-id');

CREATE POLICY "Users can create own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.headers')::json->>'x-guest-id');

CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (user_id = auth.uid() OR user_id::text = current_setting('request.headers')::json->>'x-guest-id');

-- 4. Documents Policies
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid() OR user_id::text = current_setting('request.headers')::json->>'x-guest-id'
    )
  );

CREATE POLICY "Users can insert own documents" ON documents
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid() OR user_id::text = current_setting('request.headers')::json->>'x-guest-id'
    )
  );
