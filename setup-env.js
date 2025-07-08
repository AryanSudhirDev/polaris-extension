#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupEnvironment() {
  console.log('🔧 Promptr VS Code Extension Environment Setup\n');
  
  const envPath = path.join(__dirname, '.env');
  let envContent = '';
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    console.log('📁 Found existing .env file');
    
    // Parse existing values
    const lines = existing.split('\n');
    const existingVars = {};
    
    lines.forEach(line => {
      const match = line.match(/^([^#][^=]+)=(.*)$/);
      if (match) {
        existingVars[match[1].trim()] = match[2].trim();
      }
    });
    
    console.log('Current values:');
    Object.keys(existingVars).forEach(key => {
      const value = existingVars[key];
      const display = value.includes('your_') ? 'Not set' : `${value.substring(0, 20)}...`;
      console.log(`  ${key}: ${display}`);
    });
    
    const update = await question('\nUpdate environment variables? (y/N): ');
    if (update.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }
  
  console.log('\n📝 Please provide the following values:\n');
  
  // OpenAI API Key
  const openaiKey = await question('OpenAI API Key (for original functionality): ');
  
  // Supabase URL
  const supabaseUrl = await question('Supabase URL (e.g., https://your-project.supabase.co): ');
  
  // Supabase Anon Key
  const supabaseAnonKey = await question('Supabase Anon Key (from Settings > API): ');
  
  // Supabase Service Role Key (optional)
  const supabaseServiceRoleKey = await question('Supabase Service Role Key (optional, from Settings > API): ');
  
  // Backend URL
  const backendUrl = await question('Backend API URL (default: https://xzrajxmrwumzzbnlozzr.supabase.co/functions/v1/): ');
  
  // Build .env content
  envContent = `# Promptr VS Code Extension Environment Variables

# OpenAI API Key (for the original functionality)
PROMPTR_MASTER_KEY=${openaiKey || 'your_openai_api_key_here'}

# Supabase Configuration (for the new auth system)
SUPABASE_URL=${supabaseUrl || 'https://xzrajxmrwumzzbnlozzr.supabase.co'}
SUPABASE_ANON_KEY=${supabaseAnonKey || 'your_supabase_anon_key_here'}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleKey || 'your_supabase_service_role_key_here'}

# Backend API Configuration
PROMPTR_BACKEND_URL=${backendUrl || 'https://xzrajxmrwumzzbnlozzr.supabase.co/functions/v1/'}
`;
  
  // Write .env file
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n✅ Environment variables saved to .env file!');
  console.log('\n📋 Next steps:');
  console.log('1. Get your Supabase anon key from: https://supabase.com/dashboard/project/[your-project]/settings/api');
  console.log('2. Update the .env file with the correct values');
  console.log('3. Run: npm run compile');
  console.log('4. Run: npm run package');
  console.log('5. Install the extension: code --install-extension promptr-1.2.1.vsix --force');
  
  rl.close();
}

setupEnvironment().catch(console.error); 