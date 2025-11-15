-- YM7 Hobby - Database Indexes for Performance

-- Performance indexes
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_users_status ON users(status);
CREATE INDEX CONCURRENTLY idx_users_verified ON users(email_verified) WHERE email_verified = true;

CREATE INDEX CONCURRENTLY idx_buddies_user_id ON buddies(user_id);
CREATE INDEX CONCURRENTLY idx_buddies_buddy_id ON buddies(buddy_user_id);

CREATE INDEX CONCURRENTLY idx_messages_from_user ON messages(from_user_id);
CREATE INDEX CONCURRENTLY idx_messages_to_user ON messages(to_user_id);
CREATE INDEX CONCURRENTLY idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX CONCURRENTLY idx_messages_conversation ON messages(
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    created_at DESC
);

CREATE INDEX CONCURRENTLY idx_buddy_requests_to_user ON buddy_requests(to_user_id, status);
CREATE INDEX CONCURRENTLY idx_buddy_requests_from_user ON buddy_requests(from_user_id, status);
CREATE INDEX CONCURRENTLY idx_buddy_requests_status ON buddy_requests(status, created_at);

CREATE INDEX CONCURRENTLY idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX CONCURRENTLY idx_blocks_blocked ON blocks(blocked_id);

CREATE INDEX CONCURRENTLY idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX CONCURRENTLY idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX CONCURRENTLY idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at);

CREATE INDEX CONCURRENTLY idx_token_blacklist_expires ON token_blacklist(expires_at);

CREATE INDEX CONCURRENTLY idx_audit_log_user_time ON audit_log(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_audit_log_action_time ON audit_log(action, created_at DESC);

CREATE INDEX CONCURRENTLY idx_room_messages_room ON room_messages(room_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_room_members_room ON room_members(room_id);
CREATE INDEX CONCURRENTLY idx_room_members_user ON room_members(user_id);

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddies ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY users_policy ON users FOR ALL USING (id = current_user_id());
CREATE POLICY users_select_policy ON users FOR SELECT USING (true); -- Allow seeing other users for search

CREATE POLICY buddies_policy ON buddies FOR ALL USING (user_id = current_user_id());

CREATE POLICY messages_policy ON messages FOR ALL USING (
    from_user_id = current_user_id() OR to_user_id = current_user_id()
);

CREATE POLICY buddy_requests_policy ON buddy_requests FOR ALL USING (
    from_user_id = current_user_id() OR to_user_id = current_user_id()
);

CREATE POLICY blocks_policy ON blocks FOR ALL USING (
    blocker_id = current_user_id() OR blocked_id = current_user_id()
);

CREATE POLICY refresh_tokens_policy ON refresh_tokens FOR ALL USING (user_id = current_user_id());
CREATE POLICY token_blacklist_policy ON token_blacklist FOR ALL USING (true);

CREATE POLICY audit_log_policy ON audit_log FOR ALL USING (user_id = current_user_id());

CREATE POLICY chat_rooms_policy ON chat_rooms FOR ALL USING (
    is_public = true OR created_by = current_user_id()
    OR EXISTS (SELECT 1 FROM room_members WHERE room_id = chat_rooms.id AND user_id = current_user_id())
);

CREATE POLICY room_members_policy ON room_members FOR ALL USING (
    user_id = current_user_id()
    OR EXISTS (SELECT 1 FROM chat_rooms WHERE id = room_members.room_id AND created_by = current_user_id())
);

CREATE POLICY room_messages_policy ON room_messages FOR ALL USING (
    user_id = current_user_id()
    OR EXISTS (
        SELECT 1 FROM room_members rm 
        WHERE rm.room_id = room_messages.room_id AND rm.user_id = current_user_id()
    )
);
