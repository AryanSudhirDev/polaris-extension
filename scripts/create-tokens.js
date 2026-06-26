#!/usr/bin/env node

const { randomBytes } = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_COUNT = 30;
const TOKEN_FILE = path.join(__dirname, '..', 'premium-tokens-expiring.json');
const TOKEN_ENDPOINT = 'https://promptr-api.vercel.app/api/tokens';

function printHelp() {
  console.log(`Usage:
  npm run tokens:create
  npm run tokens:create -- --count 30
  npm run tokens:create -- --count 30 --expires 2026-07-05
  npm run tokens:create -- --count 30 --deploy

Options:
  --count <number>     Number of tokens to create (default: ${DEFAULT_COUNT})
  --expires <date>     Expiration date in YYYY-MM-DD format (default: one month from today)
  --deploy             Run vercel --prod --yes after validation, then verify ${TOKEN_ENDPOINT}
  --help               Show this message
`);
}

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    deploy: false,
    expires: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--deploy') {
      options.deploy = true;
      continue;
    }

    if (arg === '--count') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --count.');
      }
      options.count = parseCount(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--count=')) {
      options.count = parseCount(arg.slice('--count='.length));
      continue;
    }

    if (arg === '--expires') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --expires.');
      }
      options.expires = parseDate(value, '--expires');
      index += 1;
      continue;
    }

    if (arg.startsWith('--expires=')) {
      options.expires = parseDate(arg.slice('--expires='.length), '--expires');
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer.');
  }

  return count;
}

function parseDate(value, optionName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${optionName} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    throw new Error(`${optionName} must be a valid calendar date.`);
  }

  return value;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function oneMonthFrom(date) {
  const nextMonth = new Date(date.getTime());
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return nextMonth;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatGeneratedAt(date) {
  return `${formatDate(date)}T00:00:00.000Z`;
}

function formatDisplayDate(yyyyMmDd) {
  const date = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function readTokenData() {
  console.log(`Reading ${path.relative(process.cwd(), TOKEN_FILE)}...`);
  const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
  const data = JSON.parse(raw);
  return data;
}

function getBatchEntries(data) {
  return Object.keys(data)
    .map((key) => {
      const match = /^batch(\d+)$/.exec(key);
      return match ? { key, number: Number(match[1]), value: data[key] } : undefined;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

function getAllTokens(data) {
  return getBatchEntries(data).flatMap(({ key, value }) => {
    if (!value || !Array.isArray(value.tokens)) {
      throw new Error(`${key}.tokens must be an array.`);
    }
    return value.tokens;
  });
}

function createToken(existingTokens) {
  let token;
  do {
    token = `PROMPTR_${randomBytes(12).toString('base64url')}`;
  } while (existingTokens.has(token));

  existingTokens.add(token);
  return token;
}

function createTokens(count, data) {
  const existingTokens = new Set(getAllTokens(data));
  return Array.from({ length: count }, () => createToken(existingTokens));
}

function addBatch(data, tokens, expiresAt, generatedAtDate) {
  const batches = getBatchEntries(data);
  const nextBatchNumber = batches.length > 0 ? Math.max(...batches.map(({ number }) => number)) + 1 : 1;
  const batchKey = `batch${nextBatchNumber}`;

  data.generated_at = formatGeneratedAt(generatedAtDate);
  data[batchKey] = {
    name: `Batch ${nextBatchNumber} - Expires ${formatDisplayDate(expiresAt)} (Short Tokens)`,
    expiresAt,
    tokens,
  };
  data.token_count = getAllTokens(data).length;

  return { batchKey, batchNumber: nextBatchNumber };
}

function validateTokenData(data, batchKey, expectedCount) {
  console.log('Validating token data...');

  JSON.parse(JSON.stringify(data));

  const batch = data[batchKey];
  if (!batch || !Array.isArray(batch.tokens)) {
    throw new Error(`New batch ${batchKey} is missing a tokens array.`);
  }

  if (batch.tokens.length !== expectedCount) {
    throw new Error(`New batch ${batchKey} has ${batch.tokens.length} tokens; expected ${expectedCount}.`);
  }

  const allTokens = getAllTokens(data);
  if (data.token_count !== allTokens.length) {
    throw new Error(`token_count is ${data.token_count}; expected ${allTokens.length}.`);
  }

  const uniqueTokens = new Set(allTokens);
  if (uniqueTokens.size !== allTokens.length) {
    throw new Error('Duplicate tokens found across batches.');
  }

  const invalidTokens = batch.tokens.filter((token) => !/^PROMPTR_[A-Za-z0-9_-]+$/.test(token));
  if (invalidTokens.length > 0) {
    throw new Error(`Invalid token format found: ${invalidTokens.join(', ')}`);
  }

  console.log(`Validation passed: ${batch.tokens.length} new tokens, ${allTokens.length} total tokens, no duplicates.`);
}

function writeTokenData(data) {
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(data, null, 2)}\n`);
  JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  console.log(`Updated ${path.relative(process.cwd(), TOKEN_FILE)}.`);
}

function deployToVercel() {
  console.log('Deploying to Vercel with: vercel --prod --yes');
  execFileSync('vercel', ['--prod', '--yes'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  console.log('Vercel deployment completed.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}.`);
  }

  return response.json();
}

async function verifyDeployment(batchKey, expectedTokens, expectedTokenCount) {
  console.log(`Verifying deployed token endpoint: ${TOKEN_ENDPOINT}`);

  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const deployedData = await fetchJson(TOKEN_ENDPOINT);
      const deployedBatch = deployedData[batchKey];
      const deployedTokens = deployedBatch && Array.isArray(deployedBatch.tokens) ? deployedBatch.tokens : [];

      if (!deployedBatch) {
        throw new Error(`Deployed response is missing ${batchKey}.`);
      }

      if (deployedData.token_count !== expectedTokenCount) {
        throw new Error(`Deployed token_count is ${deployedData.token_count}; expected ${expectedTokenCount}.`);
      }

      const missingTokens = expectedTokens.filter((token) => !deployedTokens.includes(token));
      if (missingTokens.length > 0) {
        throw new Error(`Deployed ${batchKey} is missing ${missingTokens.length} generated tokens.`);
      }

      console.log(`Deployment verification passed: ${batchKey} and token_count ${expectedTokenCount} are live.`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 10) {
        console.log(`Deployment verification attempt ${attempt} failed: ${error.message}`);
        await sleep(5000);
      }
    }
  }

  throw lastError;
}

function printShareText(tokens) {
  console.log('\nGenerated tokens:');
  tokens.forEach((token) => console.log(token));

  console.log(`
Title: [🎉GIVEAWAY] 30 LIFETIME PREMIUM CODES FOR PROMPTR (this doesnt change it always remains the same)


To start using Promptr:

Download it on the Cursor extension marketplace (search up “promptr”) and you should see the developer as "aryansudhir"

Click "Promptr 0.4" in the bottom right corner

Click "Enter Access Token"

Enter one of these access tokens to gain lifetime access to Promptr:

${tokens.join('\n')}
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const generatedAtDate = todayUtc();
  const expiresAt = options.expires || formatDate(oneMonthFrom(generatedAtDate));

  console.log(`Creating ${options.count} Promptr short tokens expiring ${expiresAt}.`);
  const data = readTokenData();
  const tokens = createTokens(options.count, data);
  const { batchKey, batchNumber } = addBatch(data, tokens, expiresAt, generatedAtDate);

  validateTokenData(data, batchKey, options.count);
  writeTokenData(data);

  console.log(`Success: added batch ${batchNumber} (${batchKey}) to premium-tokens-expiring.json.`);
  console.log(`generated_at set to ${data.generated_at}; token_count set to ${data.token_count}.`);

  if (options.deploy) {
    deployToVercel();
    await verifyDeployment(batchKey, tokens, data.token_count);
  } else {
    console.log('Deploy skipped. Pass --deploy to run vercel --prod --yes and verify the live endpoint.');
  }

  printShareText(tokens);
}

main().catch((error) => {
  console.error(`Failure: ${error.message}`);
  process.exit(1);
});
