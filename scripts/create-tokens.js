#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_COUNT = 30;
const TOKEN_PREFIX = 'PROMPTR_';
const TOKEN_BYTES = 12;
const TOKEN_FILE = path.resolve(__dirname, '..', 'premium-tokens-expiring.json');
const VERIFY_URL = 'https://promptr-api.vercel.app/api/tokens';

function usage() {
  console.log(`Usage: npm run tokens:create -- [options]

Options:
  --count <number>       Number of short tokens to generate (default: ${DEFAULT_COUNT})
  --expires <YYYY-MM-DD> Expiration date (default: one month from today)
  --deploy              Run "vercel --prod --yes" after local validation
  --help                Show this help message
`);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    expires: null,
    deploy: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }

    if (arg === '--deploy') {
      options.deploy = true;
      continue;
    }

    if (arg === '--count') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        fail('--count requires a number');
      }
      options.count = parseCount(value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--count=')) {
      options.count = parseCount(arg.slice('--count='.length));
      continue;
    }

    if (arg === '--expires') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        fail('--expires requires a date formatted YYYY-MM-DD');
      }
      options.expires = parseDateOnly(value, '--expires');
      i += 1;
      continue;
    }

    if (arg.startsWith('--expires=')) {
      options.expires = parseDateOnly(arg.slice('--expires='.length), '--expires');
      continue;
    }

    fail(`Unknown option: ${arg}`);
  }

  return options;
}

function parseCount(value) {
  if (!/^\d+$/.test(value)) {
    fail(`Invalid --count value: ${value}`);
  }

  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    fail('--count must be a positive integer');
  }

  return count;
}

function parseDateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must be formatted YYYY-MM-DD`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDateOnly(date) !== value) {
    fail(`${label} is not a valid calendar date`);
  }

  return value;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function oneMonthFrom(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatBatchDate(dateOnly) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function readTokenData() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    fail(`Could not parse ${path.basename(TOKEN_FILE)}: ${error.message}`);
  }
}

function getBatchEntries(data) {
  return Object.entries(data)
    .map(([key, value]) => {
      const match = /^batch(\d+)$/.exec(key);
      return match ? { key, number: Number(match[1]), value } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

function createTokens(count, existingTokens) {
  const tokens = [];
  const seen = new Set(existingTokens);

  while (tokens.length < count) {
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(TOKEN_BYTES).toString('base64url')}`;
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function collectTokens(data) {
  const tokens = [];
  for (const { key, value } of getBatchEntries(data)) {
    if (!value || !Array.isArray(value.tokens)) {
      fail(`${key}.tokens must be an array`);
    }
    tokens.push(...value.tokens);
  }
  return tokens;
}

function validateData(data, newBatchKey, expectedCount) {
  let parsedAgain;
  try {
    parsedAgain = JSON.parse(JSON.stringify(data));
  } catch (error) {
    fail(`JSON validation failed: ${error.message}`);
  }

  const newBatch = parsedAgain[newBatchKey];
  if (!newBatch || !Array.isArray(newBatch.tokens)) {
    fail(`New batch ${newBatchKey} is missing a tokens array`);
  }

  if (newBatch.tokens.length !== expectedCount) {
    fail(`New batch ${newBatchKey} has ${newBatch.tokens.length} tokens; expected ${expectedCount}`);
  }

  const allTokens = collectTokens(parsedAgain);
  if (parsedAgain.token_count !== allTokens.length) {
    fail(`token_count is ${parsedAgain.token_count}; expected ${allTokens.length}`);
  }

  const uniqueTokens = new Set(allTokens);
  if (uniqueTokens.size !== allTokens.length) {
    fail('Duplicate tokens found across batches');
  }

  console.log('Local validation passed:');
  console.log(`- JSON parses successfully`);
  console.log(`- ${newBatchKey} has exactly ${expectedCount} tokens`);
  console.log(`- token_count matches ${allTokens.length} total tokens`);
  console.log('- No duplicate tokens found');
}

function writeTokenData(data) {
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(data, null, 2)}\n`);

  try {
    JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (error) {
    fail(`Wrote invalid JSON to ${path.basename(TOKEN_FILE)}: ${error.message}`);
  }
}

async function deployAndVerify(newBatchKey, tokens, expectedTokenCount) {
  console.log('Deploy flag detected. Running: vercel --prod --yes');
  const deploy = spawnSync('vercel', ['--prod', '--yes'], {
    stdio: 'inherit',
    shell: false,
  });

  if (deploy.error) {
    fail(`Deployment failed to start: ${deploy.error.message}`);
  }

  if (deploy.status !== 0) {
    fail(`Deployment failed with exit code ${deploy.status}`);
  }

  console.log(`Deployment finished. Verifying ${VERIFY_URL}`);

  let lastError = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(VERIFY_URL, {
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const remoteData = await response.json();
      const remoteBatch = remoteData.batches?.[newBatchKey] || remoteData[newBatchKey];
      const remoteTokens = remoteBatch && Array.isArray(remoteBatch.tokens) ? remoteBatch.tokens : [];
      const hasAllTokens = tokens.every((token) => remoteTokens.includes(token));

      if (
        remoteData.token_count === expectedTokenCount &&
        remoteTokens.length === tokens.length &&
        hasAllTokens
      ) {
        console.log(`Remote verification passed: ${newBatchKey} and token_count are live.`);
        return;
      }

      lastError = new Error(`${newBatchKey} or token_count did not match yet`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  fail(`Remote verification failed: ${lastError ? lastError.message : 'unknown error'}`);
}

function printGiveawayPost(tokens) {
  console.log('');
  console.log('Generated tokens:');
  for (const token of tokens) {
    console.log(token);
  }

  console.log('');
  console.log('Share-ready giveaway post:');
  console.log('');
  console.log('Title: [🎉GIVEAWAY] 30 LIFETIME PREMIUM CODES FOR PROMPTR (this doesnt change it always remains the same)');
  console.log('');
  console.log('');
  console.log('To start using Promptr:');
  console.log('');
  console.log('Download it on the Cursor extension marketplace (search up "promptr") and you should see the developer as "aryansudhir"');
  console.log('');
  console.log('Click "Promptr 0.4" in the bottom right corner');
  console.log('');
  console.log('Click "Enter Access Token"');
  console.log('');
  console.log('Enter one of these access tokens to gain lifetime access to Promptr:');
  console.log('');
  for (const token of tokens) {
    console.log(token.replace(/_/g, '\\_'));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const today = todayUtc();
  const generatedAt = today.toISOString();
  const expiresAt = options.expires || formatDateOnly(oneMonthFrom(today));
  const data = readTokenData();
  const existingTokens = collectTokens(data);
  const batches = getBatchEntries(data);
  const nextBatchNumber = batches.length ? Math.max(...batches.map((batch) => batch.number)) + 1 : 1;
  const newBatchKey = `batch${nextBatchNumber}`;
  const tokens = createTokens(options.count, existingTokens);

  data.generated_at = generatedAt;
  data[newBatchKey] = {
    name: `Batch ${nextBatchNumber} - Expires ${formatBatchDate(expiresAt)} (Short Tokens)`,
    expiresAt,
    tokens,
  };
  data.token_count = collectTokens(data).length;

  validateData(data, newBatchKey, options.count);
  writeTokenData(data);
  validateData(readTokenData(), newBatchKey, options.count);

  if (options.deploy) {
    await deployAndVerify(newBatchKey, tokens, data.token_count);
  } else {
    console.log('Deploy skipped. Pass --deploy to run "vercel --prod --yes" and verify the live endpoint.');
  }

  console.log('');
  console.log(`Success: created ${newBatchKey} with ${tokens.length} tokens expiring ${expiresAt}.`);
  console.log(`Updated ${path.basename(TOKEN_FILE)} token_count to ${data.token_count}.`);
  printGiveawayPost(tokens);
}

main().catch((error) => {
  fail(error.stack || error.message);
});
