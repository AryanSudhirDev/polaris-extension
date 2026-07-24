#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const DEFAULT_COUNT = 30;
const TOKEN_FILE = path.join(__dirname, '..', 'premium-tokens-expiring.json');
const TOKEN_PREFIX = 'PROMPTR_';
const VERIFY_URL = 'https://promptr-api.vercel.app/api/tokens';
const LIVE_STATIC_URL = 'https://promptr-api.vercel.app/premium-tokens-expiring.json';

function printUsage() {
  console.log(`Usage:
  npm run tokens:create
  npm run tokens:create -- --count 30
  npm run tokens:create -- --count 30 --expires 2026-07-05
  npm run tokens:create -- --count 30 --deploy`);
}

function fail(message) {
  console.error(`\nFailure: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    deploy: false,
    expires: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--deploy') {
      options.deploy = true;
      continue;
    }

    if (arg === '--count' || arg.startsWith('--count=')) {
      const value = arg === '--count' ? argv[i + 1] : arg.slice('--count='.length);
      if (!value) {
        fail('--count requires a value.');
      }

      const count = Number(value);
      if (!Number.isInteger(count) || count < 1) {
        fail('--count must be a positive integer.');
      }

      options.count = count;
      if (arg === '--count') {
        i += 1;
      }
      continue;
    }

    if (arg === '--expires' || arg.startsWith('--expires=')) {
      const value = arg === '--expires' ? argv[i + 1] : arg.slice('--expires='.length);
      if (!value) {
        fail('--expires requires a YYYY-MM-DD value.');
      }

      options.expires = parseDateOnly(value, '--expires');
      if (arg === '--expires') {
        i += 1;
      }
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseDateOnly(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    fail(`${label} must be formatted YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    fail(`${label} is not a valid calendar date.`);
  }

  return date;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function oneMonthFrom(date) {
  const targetMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)
  ).getUTCDate();

  targetMonthStart.setUTCDate(Math.min(date.getUTCDate(), lastDayOfTargetMonth));
  return targetMonthStart;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatBatchDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function loadTokenFile() {
  let raw;

  try {
    raw = fs.readFileSync(TOKEN_FILE, 'utf8');
  } catch (error) {
    fail(`Unable to read ${TOKEN_FILE}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`JSON parse failed for ${TOKEN_FILE}: ${error.message}`);
  }
}

function getBatchEntries(data) {
  return Object.entries(data)
    .map(([key, value]) => {
      const match = /^batch(\d+)$/.exec(key);
      return match ? { key, number: Number(match[1]), value } : null;
    })
    .filter(Boolean);
}

function getNextBatchNumber(data) {
  const batchNumbers = getBatchEntries(data).map((batch) => batch.number);
  return batchNumbers.length > 0 ? Math.max(...batchNumbers) + 1 : 1;
}

function collectTokens(data) {
  return getBatchEntries(data).flatMap((batch) => {
    if (!batch.value || !Array.isArray(batch.value.tokens)) {
      fail(`${batch.key} must include a tokens array.`);
    }

    return batch.value.tokens;
  });
}

function generateTokens(count, existingTokens) {
  const tokenSet = new Set(existingTokens);
  const tokens = [];

  while (tokens.length < count) {
    const token = `${TOKEN_PREFIX}${randomBytes(12).toString('base64url')}`;

    if (!tokenSet.has(token)) {
      tokenSet.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

function validateData(data, batchKey, expectedCount) {
  const batch = data[batchKey];
  if (!batch || !Array.isArray(batch.tokens)) {
    fail(`Validation failed: ${batchKey} is missing or does not include tokens.`);
  }

  if (batch.tokens.length !== expectedCount) {
    fail(`Validation failed: ${batchKey} has ${batch.tokens.length} tokens, expected ${expectedCount}.`);
  }

  const allTokens = collectTokens(data);
  if (data.token_count !== allTokens.length) {
    fail(`Validation failed: token_count is ${data.token_count}, expected ${allTokens.length}.`);
  }

  const uniqueTokens = new Set(allTokens);
  if (uniqueTokens.size !== allTokens.length) {
    fail('Validation failed: duplicate tokens found.');
  }
}

function writeAndValidate(data, batchKey, count) {
  try {
    fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(data, null, 2)}\n`);
  } catch (error) {
    fail(`Unable to write ${TOKEN_FILE}: ${error.message}`);
  }

  const reparsed = loadTokenFile();
  validateData(reparsed, batchKey, count);
  return reparsed;
}

function runDeploy() {
  console.log('\nDeploying with: vercel --prod --yes');
  const result = spawnSync('vercel', ['--prod', '--yes'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    fail(`Deploy failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`Deploy failed with exit code ${result.status}.`);
  }

  console.log('Deployment completed successfully.');
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'promptr-token-batch-script',
        },
        timeout: 30000,
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON: ${error.message}`));
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out.'));
    });
    request.on('error', reject);
  });
}

function normalizeTokenData(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  // Live /api/tokens wraps batches; static JSON keeps top-level batchN keys.
  if (payload.batches && typeof payload.batches === 'object') {
    const normalized = {
      generated_at: payload.generated_at,
      token_count: payload.token_count,
      token_type: payload.token_type,
      features: payload.features,
    };

    for (const [key, value] of Object.entries(payload.batches)) {
      if (/^batch\d+$/.test(key)) {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  return payload;
}

function getRemoteTokenData(remoteData) {
  if (remoteData && typeof remoteData === 'object' && typeof remoteData.token_count === 'number') {
    return remoteData;
  }

  if (
    remoteData &&
    typeof remoteData === 'object' &&
    remoteData.data &&
    typeof remoteData.data === 'object' &&
    typeof remoteData.data.token_count === 'number'
  ) {
    return remoteData.data;
  }

  return null;
}

function getRemoteBatch(remoteData, batchKey) {
  if (remoteData[batchKey]) {
    return remoteData[batchKey];
  }

  if (remoteData.batches && remoteData.batches[batchKey]) {
    return remoteData.batches[batchKey];
  }

  return null;
}

async function syncFromLive() {
  console.log(`\nSyncing local token file from ${LIVE_STATIC_URL}`);

  let remote;
  try {
    remote = normalizeTokenData(await requestJson(LIVE_STATIC_URL));
  } catch (error) {
    fail(`Unable to sync from live token file: ${error.message}`);
  }

  if (!remote || typeof remote.token_count !== 'number') {
    fail('Live token file did not include a valid token_count.');
  }

  const batchEntries = getBatchEntries(remote);
  if (batchEntries.length === 0) {
    fail('Live token file did not include any batchN keys.');
  }

  const allTokens = collectTokens(remote);
  if (remote.token_count !== allTokens.length) {
    fail(
      `Live token file token_count is ${remote.token_count}, but found ${allTokens.length} tokens across batches.`
    );
  }

  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(remote, null, 2)}\n`);
  console.log(
    `Success: synced ${batchEntries.length} batches (${remote.token_count} tokens) from live.`
  );

  return remote;
}

async function verifyDeployment(batchKey, expectedData, generatedTokens) {
  console.log(`\nVerifying deployment at ${VERIFY_URL}`);

  let remoteData;
  try {
    remoteData = getRemoteTokenData(await requestJson(VERIFY_URL));
  } catch (error) {
    fail(`Deployment verification request failed: ${error.message}`);
  }

  if (!remoteData) {
    fail('Deployment verification failed: response did not include token_count.');
  }

  if (remoteData.token_count !== expectedData.token_count) {
    fail(
      `Deployment verification failed: remote token_count is ${remoteData.token_count}, expected ${expectedData.token_count}.`
    );
  }

  const remoteBatch = getRemoteBatch(remoteData, batchKey);
  if (!remoteBatch || !Array.isArray(remoteBatch.tokens)) {
    fail(`Deployment verification failed: ${batchKey} was not returned.`);
  }

  const missingTokens = generatedTokens.filter((token) => !remoteBatch.tokens.includes(token));
  if (missingTokens.length > 0) {
    fail(
      `Deployment verification failed: ${missingTokens.length} generated tokens are missing from ${batchKey}.`
    );
  }

  console.log(`Deployment verification succeeded: ${batchKey} and token_count are live.`);
}

function printTokens(tokens) {
  console.log('\nGenerated tokens:');
  tokens.forEach((token) => console.log(token));
}

function printGiveaway(tokens) {
  console.log('\nGiveaway output:\n');
  console.log(`Title: [🎉GIVEAWAY] 30 LIFETIME PREMIUM CODES FOR PROMPTR (this doesnt change it always remains the same)


To start using Promptr:

Download it on the Cursor extension marketplace (search up “promptr”) and you should see the developer as "aryansudhir"

Click "Promptr 0.4" in the bottom right corner

Click "Enter Access Token"

Enter one of these access tokens to gain lifetime access to Promptr:
`);
  tokens.forEach((token) => console.log(token.replace(/_/g, '\\_')));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const today = startOfTodayUtc();
  const expires = options.expires || oneMonthFrom(today);
  const expiresAt = formatDateOnly(expires);

  // When deploying, reconcile from production first so we never roll back live batches.
  if (options.deploy) {
    await syncFromLive();
  }

  const data = loadTokenFile();
  const existingTokens = collectTokens(data);
  const nextBatchNumber = getNextBatchNumber(data);
  const batchKey = `batch${nextBatchNumber}`;
  const tokens = generateTokens(options.count, existingTokens);

  data.generated_at = `${formatDateOnly(today)}T00:00:00.000Z`;
  data[batchKey] = {
    name: `Batch ${nextBatchNumber} - Expires ${formatBatchDate(expires)} (Short Tokens)`,
    expiresAt,
    tokens,
  };
  data.token_count = collectTokens(data).length;

  const validatedData = writeAndValidate(data, batchKey, options.count);

  console.log(`Success: created ${batchKey} with ${tokens.length} tokens.`);
  console.log(`Success: updated generated_at to ${validatedData.generated_at}.`);
  console.log(`Success: updated token_count to ${validatedData.token_count}.`);
  console.log('Success: JSON parsed, token counts match, and no duplicate tokens were found.');
  console.log('Note: this script does not create git commits.');

  if (options.deploy) {
    runDeploy();
    await verifyDeployment(batchKey, validatedData, tokens);
  } else {
    console.log(
      'Deploy skipped. Pass --deploy to sync from live, run vercel --prod --yes, and verify the live token endpoint.'
    );
  }

  printTokens(tokens);
  printGiveaway(tokens);
}

main().catch((error) => fail(error.message));
