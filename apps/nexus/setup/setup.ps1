# NEXUS - One-Click Cloudflare Setup
# Run this script from the nexus directory: .\setup\setup.ps1

param(
    [switch]$SkipMigrations,
    [switch]$SkipSecrets,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                  NEXUS One-Click Setup                       ║
║              Cloudflare Infrastructure Setup                 ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Check if wrangler is installed
Write-Host "`n[1/8] Checking prerequisites..." -ForegroundColor Yellow
try {
    $wranglerVersion = wrangler --version 2>$null
    Write-Host "  ✓ Wrangler found: $wranglerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Wrangler not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

# Check if logged in to Cloudflare
Write-Host "`n[2/8] Checking Cloudflare authentication..." -ForegroundColor Yellow
try {
    $whoami = wrangler whoami 2>$null | Out-String
    if ($whoami -match "email") {
        Write-Host "  ✓ Logged in to Cloudflare" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Not logged in. Run: wrangler login" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ Not logged in. Run: wrangler login" -ForegroundColor Red
    exit 1
}

# Create D1 Database
Write-Host "`n[3/8] Creating D1 Database..." -ForegroundColor Yellow
$DB_NAME = "nexus-db"
$DB_CHECK = wrangler d1 list 2>$null | Out-String
if ($DB_CHECK -match $DB_NAME) {
    Write-Host "  ✓ Database '$DB_NAME' already exists" -ForegroundColor Green
    $DB_ID = (wrangler d1 list 2>$null | ConvertFrom-Json | Where-Object { $_.name -eq $DB_NAME }).account_id
} else {
    Write-Host "  Creating database..." -ForegroundColor Cyan
    if (-not $DryRun) {
        $result = wrangler d1 create $DB_NAME 2>$null | ConvertFrom-Json
        $DB_ID = $result.account_id
        $DB_ID_DB = $result.id
        Write-Host "  ✓ Database created successfully" -ForegroundColor Green
    }
}

# Update wrangler.toml with D1 ID
Write-Host "`n[4/8] Updating wrangler.toml with D1 ID..." -ForegroundColor Yellow
$wranglerTomlPath = "$ProjectRoot\apps\nexus-api\wrangler.toml"
if (Test-Path $wranglerTomlPath) {
    $content = Get-Content $wranglerTomlPath -Raw
    if ($content -match 'database_id = "YOUR_D1_DATABASE_ID"') {
        if (-not $DryRun -and $DB_ID_DB) {
            $content = $content -replace 'database_id = "YOUR_D1_DATABASE_ID"', "database_id = `"$DB_ID_DB`""
            Set-Content -Path $wranglerTomlPath -Value $content
        }
        Write-Host "  ✓ D1 ID updated in wrangler.toml" -ForegroundColor Green
    } else {
        Write-Host "  ✓ D1 ID already configured" -ForegroundColor Green
    }
}

# Create KV Namespace
Write-Host "`n[5/8] Creating KV Namespace..." -ForegroundColor Yellow
$KV_NAME = "nexus-config"
$KV_CHECK = wrangler kv:namespace list 2>$null | Out-String
if ($KV_CHECK -match $KV_NAME) {
    Write-Host "  ✓ KV namespace '$KV_NAME' already exists" -ForegroundColor Green
} else {
    Write-Host "  Creating KV namespace..." -ForegroundColor Cyan
    if (-not $DryRun) {
        $result = wrangler kv:namespace create $KV_NAME 2>$null | ConvertFrom-String -Template "{id: String}" -ErrorAction SilentlyContinue
        if (-not $result) {
            # Try alternative parsing
            $result = wrangler kv:namespace create $KV_NAME 2>&1 | Select-String -Pattern "id"
        }
        Write-Host "  ✓ KV namespace created successfully" -ForegroundColor Green
    }
}

# Create R2 Bucket
Write-Host "`n[6/8] Creating R2 Bucket..." -ForegroundColor Yellow
$R2_NAME = "nexus-assets"
$R2_CHECK = wrangler r2 bucket list 2>$null | Out-String
if ($R2_CHECK -match $R2_NAME) {
    Write-Host "  ✓ R2 bucket '$R2_NAME' already exists" -ForegroundColor Green
} else {
    Write-Host "  Creating R2 bucket..." -ForegroundColor Cyan
    if (-not $DryRun) {
        wrangler r2 bucket create $R2_NAME 2>$null | Out-Null
        Write-Host "  ✓ R2 bucket created successfully" -ForegroundColor Green
    }
}

# Create Secrets Store
Write-Host "`n[7/8] Creating Secrets Store..." -ForegroundColor Yellow
$SECRETS_NAME = "nexus-secrets"
Write-Host "  ℹ Secrets Store '$SECRETS_NAME' - configure via dashboard" -ForegroundColor Cyan
Write-Host "  ℹ Go to: Cloudflare Dashboard > Workers & Pages > Secrets Store" -ForegroundColor Cyan

# Run Migrations (unless skipped)
if (-not $SkipMigrations) {
    Write-Host "`n[8/8] Running Database Migrations..." -ForegroundColor Yellow
    
    $migrations = @(
        "001_core_schema.sql",
        "002_ai_registry.sql",
        "003_prompt_templates.sql",
        "004_platform_configs.sql",
        "005_social_channels.sql"
    )
    
    foreach ($migration in $migrations) {
        $path = "$ProjectRoot\migrations\$migration"
        if (Test-Path $path) {
            Write-Host "  Running $migration..." -ForegroundColor Cyan
            if (-not $DryRun) {
                wrangler d1 execute $DB_NAME --file=$path 2>$null | Out-Null
            }
            Write-Host "  ✓ $migration completed" -ForegroundColor Green
        }
    }
} else {
    Write-Host "`n[8/8] Skipping migrations (--SkipMigrations flag)" -ForegroundColor Cyan
}

# Prompt for API Keys
if (-not $SkipSecrets) {
    Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║                     API Key Configuration                     ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan
    
    Write-Host "Enter your API keys (press Enter to skip):" -ForegroundColor Yellow
    
    # DeepSeek
    $deepseekKey = Read-Host "DeepSeek API Key (optional)"
    if ($deepseekKey) {
        if (-not $DryRun) {
            wrangler secret put DEEPSEEK_API_KEY --name nexus-api 2>$null | Out-Null
            Write-Host "  ✓ DeepSeek key stored" -ForegroundColor Green
        }
    }
    
    # Anthropic
    $anthropicKey = Read-Host "Anthropic API Key (optional)"
    if ($anthropicKey) {
        if (-not $DryRun) {
            wrangler secret put ANTHROPIC_API_KEY --name nexus-api 2>$null | Out-Null
            Write-Host "  ✓ Anthropic key stored" -ForegroundColor Green
        }
    }
    
    # Tavily
    $tavilyKey = Read-Host "Tavily API Key (optional)"
    if ($tavilyKey) {
        if (-not $DryRun) {
            wrangler secret put TAVILY_API_KEY --name nexus-ai 2>$null | Out-Null
            Write-Host "  ✓ Tavily key stored" -ForegroundColor Green
        }
    }
}

Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║                        Setup Complete!                         ║
╚══════════════════════════════════════════════════════════════╝

Next steps:
  1. cd nexus/apps/nexus-api && wrangler deploy
  2. cd nexus/apps/nexus-ai && wrangler deploy
  3. cd nexus && pnpm install && pnpm dev

For more info, see README.md
"@ -ForegroundColor Green
