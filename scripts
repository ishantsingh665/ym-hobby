#!/bin/bash

# YM7 Hobby - Database Setup Script
# Usage: ./setup-database.sh

set -e

echo "=== YM7 Hobby Database Setup ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Generate secure password if not provided
DB_PASSWORD=${1:-$(openssl rand -base64 32)}

echo -e "${YELLOW}Setting up database: ymd_hobby${NC}"
echo -e "${YELLOW}Database user: ymt_superadmin${NC}"

# Check if PostgreSQL is running
if ! systemctl is-active --quiet postgresql; then
    echo -e "${RED}PostgreSQL is not running. Starting PostgreSQL...${NC}"
    sudo systemctl start postgresql
fi

# Setup database and user
echo -e "${YELLOW}Creating database and user...${NC}"
sudo -u postgres psql << EOF
-- Create database if not exists
SELECT 'CREATE DATABASE ymd_hobby' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ymd_hobby')\gexec

-- Create user if not exists and set password
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ymt_superadmin') THEN
        CREATE USER ymt_superadmin WITH PASSWORD '$DB_PASSWORD';
    ELSE
        ALTER USER ymt_superadmin WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ymd_hobby TO ymt_superadmin;
EOF

echo -e "${GREEN}Database and user created successfully${NC}"

# Run schema scripts
echo -e "${YELLOW}Running schema scripts...${NC}"
sudo -u postgres psql -d ymd_hobby -f database/schema-complete.sql
sudo -u postgres psql -d ymd_hobby -f database/functions.sql
sudo -u postgres psql -d ymd_hobby -f database/indexes.sql

# Grant table permissions
echo -e "${YELLOW}Setting up permissions...${NC}"
sudo -u postgres psql -d ymd_hobby << EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ymt_superadmin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ymt_superadmin;
GRANT ALL ON SCHEMA public TO ymt_superadmin;
EOF

echo -e "${GREEN}✅ Database setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}=== Database Information ===${NC}"
echo -e "Database: ${GREEN}ymd_hobby${NC}"
echo -e "User: ${GREEN}ymt_superadmin${NC}"
echo -e "Password: ${GREEN}$DB_PASSWORD${NC}"
echo -e "Connection: ${GREEN}psql -h localhost -d ymd_hobby -U ymt_superadmin -W${NC}"
echo ""
echo -e "${YELLOW}Save this password in your .env file!${NC}"
