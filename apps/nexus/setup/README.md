# NEXUS Setup Guide

## Quick Start (One-Click Setup)

### Windows (PowerShell)
```powershell
cd nexus
.\setup\setup.ps1
```

### Linux/macOS (Bash)
```bash
cd nexus
chmod +x setup/setup.sh
./setup/setup.sh
```

## What the Setup Does

1. **Checks prerequisites** - Verifies Wrangler is installed and you're logged into Cloudflare
2. **Creates D1 Database** - `nexus-db` SQLite database
3. **Creates KV Namespace** - `nexus-config` for config caching
4. **Creates R2 Bucket** - `nexus-assets` for file storage
5. **Updates wrangler.toml** - Inserts actual IDs into configuration
6. **Runs migrations** - Creates all 16 database tables and seeds data
7. **Prompts for API keys** - DeepSeek, Anthropic, Tavily (optional)

## Manual Setup (If One-Click Fails)

### 1. Login to Cloudflare
```bash
wrangler login
```

### 2. Create D1 Database
```bash
wrangler d1 create nexus-db
# Copy the ID and update apps/nexus-api/wrangler.toml
```

### 3. Create KV Namespace
```bash
wrangler kv:namespace create nexus-config
# Copy the ID and update wrangler.toml
```

### 4. Create R2 Bucket
```bash
wrangler r2 bucket create nexus-assets
```

### 5. Run Migrations
```bash
wrangler d1 execute nexus-db --file=migrations/001_core_schema.sql
wrangler d1 execute nexus-db --file=migrations/002_ai_registry.sql
wrangler d1 execute nexus-db --file=migrations/003_prompt_templates.sql
wrangler d1 execute nexus-db --file=migrations/004_platform_configs.sql
wrangler d1 execute nexus-db --file=migrations/005_social_channels.sql
```

### 6. Add API Keys
```bash
# For nexus-api worker
wrangler secret put DEEPSEEK_API_KEY --name nexus-api
wrangler secret put ANTHROPIC_API_KEY --name nexus-api

# For nexus-ai worker  
wrangler secret put TAVILY_API_KEY --name nexus-ai
wrangler secret put EXA_API_KEY --name nexus-ai
```

### 7. Update wrangler.toml
Update `apps/nexus-api/wrangler.toml` with:
- `database_id` from D1 create
- `id` for KV namespace

## API Keys Needed

| Service | API Key | Used By |
|---------|---------|---------|
| DeepSeek | https://platform.deepseek.com | nexus-ai (default) |
| Anthropic | https://console.anthropic.com | nexus-ai (failover) |
| Tavily | https://tavily.com | nexus-ai (research) |
| Exa | https://exa.ai | nexus-ai (research) |

## Deploy Workers

```bash
# Deploy API worker
cd apps/nexus-api
wrangler deploy

# Deploy AI worker
cd apps/nexus-ai
wrangler deploy

# Or use Turborepo
cd ../..
pnpm --filter nexus-api deploy
pnpm --filter nexus-ai deploy
```

## Verify Setup

```bash
# Test API health
curl https://nexus-api.your-subdomain.workers.dev/health

# Should return:
# {"status":"ok","timestamp":"...","version":"0.1.0"}
```

## Troubleshooting

### "Command not found: wrangler"
```bash
npm install -g wrangler
```

### "Not logged in"
```bash
wrangler login
```

### Migration fails
```bash
# Check database exists
wrangler d1 list

# Try with --local for local development
wrangler d1 execute nexus-db --local --file=migrations/001_core_schema.sql
```

### Secrets not working
```bash
# List secrets
wrangler secret list --name nexus-api

# Delete and re-add
wrangler secret delete DEEPSEEK_API_KEY --name nexus-api
wrangler secret put DEEPSEEK_API_KEY --name nexus-api
```
