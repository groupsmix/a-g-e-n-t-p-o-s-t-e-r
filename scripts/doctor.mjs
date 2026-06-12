#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

console.log('🩺 Running PosterAgent workspace doctor check...');

let failed = false;

// 1. Check Node version >= 20
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
if (nodeMajor < 20) {
  console.error(`❌ Node.js version is ${nodeVersion}. Minimum required is v20.`);
  failed = true;
} else {
  console.log(`✅ Node.js version is ${nodeVersion} (>= v20)`);
}

// 2. Check pnpm version >= 9
try {
  const pnpmVersionStr = execSync('pnpm --version', { encoding: 'utf8' }).trim();
  const pnpmMajor = parseInt(pnpmVersionStr.split('.')[0], 10);
  if (pnpmMajor < 9) {
    console.error(`❌ pnpm version is ${pnpmVersionStr}. Minimum required is v9.`);
    failed = true;
  } else {
    console.log(`✅ pnpm version is ${pnpmVersionStr} (>= v9)`);
  }
} catch (err) {
  console.error('❌ pnpm is not installed or not in PATH');
  failed = true;
}

// 3. Check if root node_modules exists
const rootNodeModules = join(process.cwd(), 'node_modules');
if (!existsSync(rootNodeModules)) {
  console.error('❌ Root node_modules directory not found. Please run `pnpm install`.');
  failed = true;
} else {
  console.log('✅ Root node_modules is present');
}

// 4. Check for .env file
const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.warn('⚠️  .env file not found. Copy it from .env.example and configure keys.');
} else {
  console.log('✅ .env file exists');
}

if (failed) {
  console.error('\n❌ Doctor check failed. Fix the issues above before running the app.');
  process.exit(1);
} else {
  console.log('\n✅ Workspace is healthy!');
  process.exit(0);
}
