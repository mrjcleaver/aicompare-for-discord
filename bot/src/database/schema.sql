-- AI Compare Discord Bot Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    encrypted_api_keys JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{
        "defaultModels": ["gpt-4", "claude-3.5-sonnet"],
        "temperature": 0.7,
        "maxTokens": 1000,
        "notificationPreference": "channel",
        "displayFormat": "detailed",
        "theme": "light"
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_discord_id CHECK (char_length(discord_id) >= 17 AND char_length(discord_id) <= 20)
);

-- Teams/Guilds table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_guild_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{
        "enabledModels": ["gpt-4", "claude-3.5-sonnet", "gemini-1.5-pro", "command-r-plus"],
        "rateLimitPerUser": 10,
        "rateLimitPerHour": 100,
        "allowedChannels": [],
        "moderatorRoles": []
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User team memberships
CREATE TABLE IF NOT EXISTS user_teams (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, team_id)
);

-- Queries table
CREATE TABLE IF NOT EXISTS queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20) NOT NULL,
    prompt TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    models_requested TEXT[] NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    CONSTRAINT valid_prompt_length CHECK (char_length(prompt) >= 1 AND char_length(prompt) <= 4000)
);

-- Responses table
CREATE TABLE IF NOT EXISTS responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    model_name VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    response_time_ms INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 8) DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_response_time CHECK (response_time_ms >= 0),
    CONSTRAINT valid_token_count CHECK (token_count >= 0),
    CONSTRAINT valid_cost CHECK (estimated_cost >= 0)
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_id UUID REFERENCES responses(id) ON DELETE CASCADE,
    query_id UUID REFERENCES queries(id) ON DELETE CASCADE,
    vote_type VARCHAR(20) NOT NULL CHECK (vote_type IN ('thumbs_up', 'thumbs_down', 'star_rating')),
    value INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_star_rating CHECK (
        (vote_type != 'star_rating') OR (value >= 1 AND value <= 5)
    ),
    CONSTRAINT valid_thumbs_vote CHECK (
        (vote_type NOT IN ('thumbs_up', 'thumbs_down')) OR (value IN (-1, 1))
    ),
    -- Ensure one vote per user per response/query combination
    UNIQUE (user_id, response_id, vote_type),
    UNIQUE (user_id, query_id, vote_type) DEFERRABLE INITIALLY DEFERRED
);

-- Comments table (for Discord threads)
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    discord_thread_id VARCHAR(20),
    discord_message_id VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_content_length CHECK (char_length(content) >= 1 AND char_length(content) <= 2000)
);

-- Similarity metrics table
CREATE TABLE IF NOT EXISTS similarity_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    semantic_similarity DECIMAL(5, 2) DEFAULT 0 CHECK (semantic_similarity >= 0 AND semantic_similarity <= 100),
    length_consistency DECIMAL(5, 2) DEFAULT 0 CHECK (length_consistency >= 0 AND length_consistency <= 100),
    sentiment_alignment DECIMAL(5, 2) DEFAULT 0 CHECK (sentiment_alignment >= 0 AND sentiment_alignment <= 100),
    response_speed_score DECIMAL(5, 2) DEFAULT 0 CHECK (response_speed_score >= 0 AND response_speed_score <= 100),
    aggregate_score DECIMAL(5, 2) DEFAULT 0 CHECK (aggregate_score >= 0 AND aggregate_score <= 100),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (query_id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);

CREATE INDEX IF NOT EXISTS idx_teams_discord_guild_id ON teams(discord_guild_id);

CREATE INDEX IF NOT EXISTS idx_queries_user_id ON queries(user_id);
CREATE INDEX IF NOT EXISTS idx_queries_team_id ON queries(team_id);
CREATE INDEX IF NOT EXISTS idx_queries_status ON queries(status);
CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at);
CREATE INDEX IF NOT EXISTS idx_queries_channel_id ON queries(channel_id);

CREATE INDEX IF NOT EXISTS idx_responses_query_id ON responses(query_id);
CREATE INDEX IF NOT EXISTS idx_responses_model_name ON responses(model_name);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses(created_at);

CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_response_id ON votes(response_id);
CREATE INDEX IF NOT EXISTS idx_votes_query_id ON votes(query_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);

CREATE INDEX IF NOT EXISTS idx_comments_query_id ON comments(query_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_discord_thread_id ON comments(discord_thread_id);

CREATE INDEX IF NOT EXISTS idx_similarity_metrics_query_id ON similarity_metrics(query_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Views for common queries
CREATE OR REPLACE VIEW query_stats AS
SELECT 
    q.id,
    q.user_id,
    q.team_id,
    q.prompt,
    q.status,
    q.created_at,
    q.completed_at,
    array_length(q.models_requested, 1) as models_count,
    COUNT(r.id) as responses_count,
    COUNT(r.id) FILTER (WHERE r.error_message IS NULL) as successful_responses,
    AVG(r.response_time_ms) as avg_response_time,
    SUM(r.token_count) as total_tokens,
    SUM(r.estimated_cost) as total_cost,
    COUNT(v.id) as total_votes,
    COUNT(v.id) FILTER (WHERE v.vote_type = 'thumbs_up') as thumbs_up,
    COUNT(v.id) FILTER (WHERE v.vote_type = 'thumbs_down') as thumbs_down,
    AVG(v.value) FILTER (WHERE v.vote_type = 'star_rating') as avg_star_rating,
    sm.aggregate_score as similarity_score
FROM queries q
LEFT JOIN responses r ON q.id = r.query_id
LEFT JOIN votes v ON q.id = v.query_id
LEFT JOIN similarity_metrics sm ON q.id = sm.query_id
GROUP BY q.id, q.user_id, q.team_id, q.prompt, q.status, q.created_at, q.completed_at, q.models_requested, sm.aggregate_score;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_votes_updated_at BEFORE UPDATE ON votes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update user last_active
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update user last_active on new queries
CREATE TRIGGER update_user_last_active_on_query AFTER INSERT ON queries
    FOR EACH ROW EXECUTE FUNCTION update_user_last_active();

-- Data retention policy (delete old audit logs after 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your deployment)
-- These would typically be customized based on your specific user roles
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aicompare_bot;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aicompare_bot;