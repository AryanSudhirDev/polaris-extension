const webpack = require('webpack');
const path = require('path');
require('dotenv').config();

// Read environment variables from .env
const apiKey = process.env.PROMPTR_MASTER_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backendUrl = process.env.PROMPTR_BACKEND_URL;

if (!apiKey) {
  console.warn('WARNING: PROMPTR_MASTER_KEY not found in .env file - extension will prompt user to set it up');
}

console.log('Environment variables loaded:');
console.log('- PROMPTR_MASTER_KEY:', apiKey ? '✓ Set' : '✗ Missing');
console.log('- SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
console.log('- SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? '✓ Set' : '✗ Missing');
console.log('- PROMPTR_BACKEND_URL:', backendUrl ? '✓ Set' : '✗ Missing');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        SUPABASE_URL: JSON.stringify(supabaseUrl),
        SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
        SUPABASE_SERVICE_ROLE_KEY: JSON.stringify(supabaseServiceRoleKey),
        PROMPTR_BACKEND_URL: JSON.stringify(backendUrl)
      }
    })
  ]
}; 