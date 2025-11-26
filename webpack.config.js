const webpack = require('webpack');
const path = require('path');

// Load .env so runtime can still access variables, but we no longer embed secrets in the bundle
require('dotenv').config();

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
    // Expose selected env vars at runtime; they are NOT inlined into the bundle
    // Provide empty-string defaults so webpack doesn't error if they're not set locally
    new webpack.EnvironmentPlugin({
      PROMPTR_MASTER_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      PROMPTR_BACKEND_URL: ''
    })
  ]
}; 