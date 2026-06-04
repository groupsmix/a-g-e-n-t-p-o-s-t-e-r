#!/bin/bash
# NEXUS - One-Click Cloudflare Setup (Bash version)
# Run: chmod +x setup.sh && ./setup/setup.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="nexus-db"
KV_NAME="nexus-config"
R2_NAME="nexus-assets"

echo -e "\033[1;36m╔══════════════════════════════════════════════════════════════╗
║                  NEXUS One-Click Setup                       ║
║              Cloudflare Infrastructure Setup                 ║
╚══════════════════════════════════════════════════════════════╝\033[0m"

# Check prerequisites
echo -e "\033[1;33m[1/8] Checking prerequisites...\033[0m"
if ! command -v wrangler &> /dev/null; then
    echo -e "\033[1;31m  ✗ Wrangler not found. Install with: npm install -g wrangler\033[0m"
    exit 1
fi
echo -e "\033[1;32m  ✓ Wrangler found: $(wrangler --version)\033[0m"

# Check authentication
echo -e "\033[1;33m[2/8] Checking Cloudflare authentication...\033[0m"
if wrangler whoami &> /dev/null; then
    echo -e "\033[1;32m  ✓ Logged in to Cloudflare\033[0m"
else
    echo -e "\033[1;31m  ✗ Not logged in. Run: wrangler login\033[0m"
    exit 1
fi

# Create D1 Database
echo -e "\033[1;33m[3/8] Creating D1 Database...\033[0m"
if wrangler d1 list 2>/dev/null | grep -q "$DB_NAME"; then
    echo -e "\033[1;32m  ✓ Database '$DB_NAME' already exists\033[0m"
else
    echo -e "\033[1;36m  Creating database...\033[0m"
    DB_RESULT=$(wrangler d1 create $DB_NAME 2>/dev/null)
    DB_ID=$(echo "$DB_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo -e "\033[1;32m  ✓ Database created successfully\033[0m"
fi

# Update wrangler.toml with D1 ID
echo -e "\033[1;33m[4/8] Updating wrangler.toml with D1 ID...\033[0m"
WRANGLER_TOML="$PROJECT_ROOT/apps/nexus-api/wrangler.toml"
if [ -f "$WRANGLER_TOML" ]; then
    if grep -q 'database_id = "YOUR_D1_DATABASE_ID"' "$WRANGLER_TOML"; then
        if [ -n "$DB_ID" ]; then
            sed -i "s/database_id = \"YOUR_D1_DATABASE_ID\"/database_id = \"$DB_ID\"/" "$WRANGLER_TOML"
        fi
        echo -e "\033[1;32m  ✓ D1 ID updated in wrangler.toml\033[0m"
    else
        echo -e "\033[1;32m  ✓ D1 ID already configured\033[0m"
    fi
fi

# Create KV Namespace
echo -e "\033[1;33m[5/8] Creating KV Namespace...\033[0m"
if wrangler kv:namespace list 2>/dev/null | grep -q "$KV_NAME"; then
    echo -e "\033[1;32m  ✓ KV namespace '$KV_NAME' already exists\033[0m"
else
    echo -e "\033[1;36m  Creating KV namespace...\033[0m"
    KV_RESULT=$(wrangler kv:namespace create $KV_NAME 2>/dev/null)
    KV_ID=$(echo "$KV_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    # Update wrangler.toml with KV ID
    if [ -n "$KV_ID" ]; then
        sed -i "s/preview_id = \"YOUR_KV_PREVIEW_ID\"/preview_id = \"$KV_ID\"/" "$WRANGLER_TOML" 2>/dev/null || true
        sed -i "s/id = \"YOUR_KV_ID\"/id = \"$KV_ID\"/" "$WRANGLER_TOML" 2>/dev/null || true
    fi
    echo -e "\033[1;32m  ✓ KV namespace created successfully\033[0m"
fi

# Create R2 Bucket
echo -e "\033[1;33m[6/8] Creating R2 Bucket...\033[0m"
if wrangler r2 bucket list 2>/dev/null | grep -q "$R2_NAME"; then
    echo -e "\033[1;32m  ✓ R2 bucket '$R2_NAME' already exists\033[0m"
else
    echo -e "\033[1;36m  Creating R2 bucket...\033[0m"
    wrangler r2 bucket create $R2_NAME 2>/dev/null
    echo -e "\033[1;32m  ✓ R2 bucket created successfully\033[0m"
fi

# Create Secrets Store
echo -e "\033[1;33m[7/8] Creating Secrets Store...\033[0m"
echo -e "\033[1;36m  ℹ Secrets Store - configure via dashboard\033[0m"
echo -e "\033[1;36m  ℹ Go to: Cloudflare Dashboard > Workers & Pages > Secrets Store\033[0m"

# Run Migrations (unless skipped)
SKIP_MIGRATIONS=false
if [ "$1" == "--skip-migrations" ]; then
    SKIP_MIGRATIONS=true
fi

if [ "$SKIP_MIGRATIONS" = false ]; then
    echo -e "\033[1;33m[8/8] Running Database Migrations...\033[0m"
    
    for migration in 001_core_schema 002_ai_registry 003_prompt_templates 004_platform_configs 005_social_channels; do
        SQL_FILE="$PROJECT_ROOT/migrations/${migration}.sql"
        if [ -f "$SQL_FILE" ]; then
            echo -e "\033[1;36m  Running ${migration}.sql...\033[0m"
            wrangler d1 execute $DB_NAME --file="$SQL_FILE" 2>/dev/null
            echo -e "\033[1;32m  ✓ ${migration}.sql completed\033[0m"
        fi
    done
else
    echo -e "\033[1;33m[8/8] Skipping migrations (--skip-migrations flag)\033[0m"
fi

echo -e "\033[1;36m
╔══════════════════════════════════════════════════════════════╗
║                        Setup Complete!                         ║
╚══════════════════════════════════════════════════════════════╝
\033[0m"

echo -e "\033[1;32mNext steps:
  1. cd nexus/apps/nexus-api && wrangler deploy
  2. cd nexus/apps/nexus-ai && wrangler deploy  
  3. cd nexus && pnpm install && pnpm dev

For API keys, run:
  wrangler secret put DEEPSEEK_API_KEY --name nexus-api
  wrangler secret put ANTHROPIC_API_KEY --name nexus-api
  wrangler secret put TAVILY_API_KEY --name nexus-ai

For more info, see README.md\033[0m"
