-- YM7 Hobby - Database Functions

-- RLS current_user_id function
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS INTEGER AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::INTEGER;
EXCEPTION
    WHEN undefined_object THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automated cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    -- Clean expired tokens (1 day grace period)
    DELETE FROM token_blacklist WHERE expires_at < NOW() - INTERVAL '1 day';
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    
    -- Clean old rejected/expired buddy requests (30 days)
    DELETE FROM buddy_requests 
    WHERE (status IN ('rejected', 'expired') AND updated_at < NOW() - INTERVAL '30 days')
       OR (status = 'pending' AND created_at < NOW() - INTERVAL '7 days');
    
    -- Clean old audit logs (keep 90 days)
    DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Expire old pending buddy requests
    UPDATE buddy_requests 
    SET status = 'expired', updated_at = NOW() 
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to log user actions
CREATE OR REPLACE FUNCTION log_user_action(
    p_user_id INTEGER,
    p_action VARCHAR(100),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO audit_log (user_id, action, ip_address, user_agent, details)
    VALUES (p_user_id, p_action, p_ip_address, p_user_agent, p_details);
END;
$$ LANGUAGE plpgsql;

-- Function to check if users are buddies
CREATE OR REPLACE FUNCTION are_users_buddies(user1_id INTEGER, user2_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM buddies 
        WHERE (user_id = user1_id AND buddy_user_id = user2_id)
           OR (user_id = user2_id AND buddy_user_id = user1_id)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is blocked
CREATE OR REPLACE FUNCTION is_user_blocked(blocker_id INTEGER, blocked_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM blocks 
        WHERE blocker_id = $1 AND blocked_id = $2
    );
END;
$$ LANGUAGE plpgsql;
