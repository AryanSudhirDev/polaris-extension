#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_COUNT = 30;
const TOKEN_PREFIX = 'PROMPTR_';
const TOKEN_BYTES = 12;
const TOKENS_FILE = path.join(__dirname, '..', 'premium-tokens-expiring.json');
const TOKENS_ENDPOINT = 'https://promptr-api.vercel.app/api/tokens';

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    expires: null,
    deploy: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--deploy') {
      options.deploy = true;
      continue;
    }

    if (arg === '--count') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --count.');
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
      if (!value) {
        throw new Error('Missing value for --expires.');
      }
      options.expires = parseExpires(value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--expires=')) {
      options.expires = parseExpires(arg.slice('--expires='.length));
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.expires) {
    options.expires = addOneUtcMonth(todayUtc());
  }

  return options;
}

function parseCount(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error('--count must be a positive integer.');
  }

  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer.');
  }

  return count;
}

function parseExpires(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--expires must use YYYY-MM-DD format.');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (formatDate(date) !== value) {
    throw new Error('--expires must be a valid calendar date.');
  }

  return date;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addOneUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatGeneratedAt(date) {
  return `${formatDate(date)}T00:00:00.000Z`;
}

function formatBatchDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function readTokenData() {
  const raw = fs.readFileSync(TOKENS_FILE, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON parse failed for ${path.basename(TOKENS_FILE)}: ${error.message}`);
  }
}

function findNextBatchNumber(data) {
  const batchNumbers = Object.keys(data)
    .map((key) => {
      const match = /^batch(\d+)$/.exec(key);
      return match ? Number(match[1]) : null;
    })
    .filter((number) => number !== null);

  return batchNumbers.length > 0 ? Math.max(...batchNumbers) + 1 : 1;
}

function getAllTokens(data) {
  return Object.keys(data)
    .filter((key) => /^batch\d+$/.test(key))
    .flatMap((key) => {
      const tokens = data[key] && data[key].tokens;
      return Array.isArray(tokens) ? tokens : [];
    });
}

function generateTokens(count, existingTokens) {
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

function validateTokenData(data, batchKey, expectedCount) {
  JSON.parse(JSON.stringify(data));

  const batch = data[batchKey];
  if (!batch || !Array.isArray(batch.tokens)) {
    throw new Error(`Validation failed: ${batchKey} is missing a tokens array.`);
  }

  if (batch.tokens.length !== expectedCount) {
    throw new Error(
      `Validation failed: ${batchKey} has ${batch.tokens.length} tokens; expected ${expectedCount}.`
    );
  }

  const allTokens = getAllTokens(data);
  if (data.token_count !== allTokens.length) {
    throw new Error(
      `Validation failed: token_count is ${data.token_count}; expected ${allTokens.length}.`
    );
  }

  const duplicates = allTokens.filter((token, index) => allTokens.indexOf(token) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Validation failed: duplicate tokens found: ${[...new Set(duplicates)].join(', ')}`);
  }
}

function writeTokenData(data) {
  fs.writeFileSync(TOKENS_FILE, `${JSON.stringify(data, null, 2)}\n`);
}

function runDeploy() {
  console.log('\nDeploy flag detected. Running vercel --prod --yes...');
  const result = spawnSync('vercel', ['--prod', '--yes'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw new Error(`Failed to start Vercel deploy: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Vercel deploy failed with exit code ${result.status}.`);
  }
}

async function verifyDeployment(batchKey, expectedTokenCount, expectedTokens) {
  console.log(`\nVerifying deployed token data from ${TOKENS_ENDPOINT}...`);
  const response = await fetch(TOKENS_ENDPOINT, { headers: { accept: 'application/json' } });

  if (!response.ok) {
    throw new Error(`Deployment verification failed: ${TOKENS_ENDPOINT} returned ${response.status}.`);
  }

  const liveData = await response.json();
  const liveBatch = liveData[batchKey];
  if (!liveBatch || !Array.isArray(liveBatch.tokens)) {
    throw new Error(`Deployment verification failed: ${batchKey} was not returned.`);
  }

  if (liveData.token_count !== expectedTokenCount) {
    throw new Error(
      `Deployment verification failed: token_count is ${liveData.token_count}; expected ${expectedTokenCount}.`
    );
  }

  const missingTokens = expectedTokens.filter((token) => !liveBatch.tokens.includes(token));
  if (missingTokens.length > 0) {
    throw new Error(`Deployment verification failed: ${missingTokens.length} new tokens were not returned.`);
  }

  console.log(`Success: deployed ${batchKey} and token_count ${expectedTokenCount} are live.`);
}

function printTokens(tokens) {
  console.log('\nGenerated tokens:');
  tokens.forEach((token) => console.log(token));
}

function printGiveawayOutput(tokens) {
  console.log('\nGiveaway output:\n');
  console.log('Title: [🎉GIVEAWAY] 30 LIFETIME PREMIUM CODES FOR PROMPTR (this doesnt change it always remains the same)');
  console.log('');
  console.log('');
  console.log('To start using Promptr:');
  console.log('');
  console.log('Download it on the Cursor extension marketplace (search up “promptr”) and you should see the developer as "aryansudhir"');
  console.log('');
  console.log('Click "Promptr 0.4" in the bottom right corner');
  console.log('');
  console.log('Click "Enter Access Token"');
  console.log('');
  console.log('Enter one of these access tokens to gain lifetime access to Promptr:');
  console.log('');
  tokens.forEach((token) => console.log(token.replace(/_/g, '\\_')));
}

function printUsage() {
  console.log(`Usage: npm run tokens:create -- [options]

Options:
  --count <number>       Number of short tokens to create. Defaults to ${DEFAULT_COUNT}.
  --expires <YYYY-MM-DD> Expiration date. Defaults to one month from today.
  --deploy               Run vercel --prod --yes and verify the live /api/tokens response.
  --help                 Show this help message.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const today = todayUtc();
  const data = readTokenData();
  const batchNumber = findNextBatchNumber(data);
  const batchKey = `batch${batchNumber}`;
  const existingTokens = getAllTokens(data);
  const tokens = generateTokens(options.count, existingTokens);

  data.generated_at = formatGeneratedAt(today);
  data[batchKey] = {
    name: `Batch ${batchNumber} - Expires ${formatBatchDate(options.expires)} (Short Tokens)`,
    expiresAt: formatDate(options.expires),
    tokens,
  };
  data.token_count = getAllTokens(data).length;

  validateTokenData(data, batchKey, options.count);
  writeTokenData(data);
  validateTokenData(readTokenData(), batchKey, options.count);

  console.log(`Success: created ${options.count} Promptr tokens in ${batchKey}.`);
  console.log(`Success: ${path.basename(TOKENS_FILE)} parses and token_count is ${data.token_count}.`);

  if (options.deploy) {
    runDeploy();
    await verifyDeployment(batchKey, data.token_count, tokens);
  } else {
    console.log('Deploy skipped. Re-run with --deploy to publish and verify the live API.');
  }

  printTokens(tokens);
  printGiveawayOutput(tokens);
}

main().catch((error) => {
  console.error(`Failure: ${error.message}`);
  process.exit(1);
});
