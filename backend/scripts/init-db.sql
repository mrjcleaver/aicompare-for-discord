-- Database initialization script for AI Compare
-- This script sets up the initial database configuration

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create indexes for better performance after Prisma migration
-- These will be created after tables exist, so we'll wrap in a function
-- that can be called after the application starts

CREATE OR REPLACE FUNCTION create_performance_indexes()
RETURNS void AS $$
BEGIN
  -- Only create indexes if tables exist
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
    -- Users table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_discord_id ON users USING btree (discord_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active ON users USING btree (last_active);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users USING btree (created_at);
    
    -- Teams table indexes  
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_discord_server_id ON teams USING btree (discord_server_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_created_at ON teams USING btree (created_at);
    
    -- Queries table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_user_id_created_at ON queries USING btree (user_id, created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_team_id_created_at ON queries USING btree (team_id, created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_status ON queries USING btree (status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_models_requested ON queries USING gin (models_requested);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_prompt_search ON queries USING gin (to_tsvector('english', prompt));
    
    -- Responses table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_query_id_created_at ON responses USING btree (query_id, created_at);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_model_name ON responses USING btree (model_name);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_status ON responses USING btree (status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_cost_usd ON responses USING btree (cost_usd);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_response_time_ms ON responses USING btree (response_time_ms);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_content_search ON responses USING gin (to_tsvector('english', content));
    
    -- Votes table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_response_id ON votes USING btree (response_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_user_id ON votes USING btree (user_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_created_at ON votes USING btree (created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_vote_type ON votes USING btree (vote_type);
    
    -- Comments table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_query_id_created_at ON comments USING btree (query_id, created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_user_id ON comments USING btree (user_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_discord_thread_id ON comments USING btree (discord_thread_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_content_search ON comments USING gin (to_tsvector('english', content));
    
    -- Comparisons table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comparisons_query_id ON comparisons USING btree (query_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comparisons_aggregate_score ON comparisons USING btree (aggregate_score DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comparisons_semantic_similarity ON comparisons USING btree (semantic_similarity DESC);
    
    -- Audit logs table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id_created_at ON audit_logs USING btree (user_id, created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action ON audit_logs USING btree (action);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource ON audit_logs USING btree (resource);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs USING btree (created_at DESC);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs USING btree (ip_address);
    
    -- User teams table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_user_id ON user_teams USING btree (user_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_team_id ON user_teams USING btree (team_id);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_role ON user_teams USING btree (role);
    
    -- Rate limits table indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rate_limits_key ON rate_limits USING btree (key);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits USING btree (reset_at);
    
    RAISE NOTICE 'Performance indexes created successfully';
  ELSE
    RAISE NOTICE 'Tables do not exist yet, skipping index creation';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Clean up old rate limit entries
  DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 day';
  
  -- Clean up old audit logs (keep for 90 days)
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Clean up failed responses older than 7 days
  DELETE FROM responses 
  WHERE status = 'FAILED' 
    AND created_at < NOW() - INTERVAL '7 days';
  
  -- Clean up old sessions/cache data would go here if we stored them in PostgreSQL
  
  RAISE NOTICE 'Old data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Create a function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance()
RETURNS TABLE (
  query_date DATE,
  total_queries BIGINT,
  avg_response_time_ms NUMERIC,
  total_cost_usd NUMERIC,
  most_used_model TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.created_at::DATE as query_date,
    COUNT(q.id) as total_queries,
    AVG(r.response_time_ms)::NUMERIC as avg_response_time_ms,
    SUM(r.cost_usd)::NUMERIC as total_cost_usd,
    (
      SELECT r2.model_name 
      FROM responses r2 
      WHERE DATE(r2.created_at) = DATE(q.created_at)
      GROUP BY r2.model_name 
      ORDER BY COUNT(*) DESC 
      LIMIT 1
    ) as most_used_model
  FROM queries q
  LEFT JOIN responses r ON r.query_id = q.id
  WHERE q.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY q.created_at::DATE
  ORDER BY query_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT EXECUTE ON FUNCTION create_performance_indexes() TO PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO PUBLIC;
GRANT EXECUTE ON FUNCTION analyze_query_performance() TO PUBLIC;

-- Set default settings for performance
ALTER DATABASE aicompare SET shared_preload_libraries = 'pg_stat_statements';
ALTER DATABASE aicompare SET log_statement = 'mod';
ALTER DATABASE aicompare SET log_min_duration_statement = 1000;

-- Create a simple health check function
CREATE OR REPLACE FUNCTION health_check()
RETURNS TEXT AS $$
BEGIN
  RETURN 'OK';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION health_check() TO PUBLIC;