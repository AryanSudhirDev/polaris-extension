const webpack = require('webpack');
const path = require('path');
require('dotenv').config();

// Read the API key from .env
const apiKey = process.env.PROMPTR_MASTER_KEY;
if (!apiKey) {
  console.error('ERROR: PROMPTR_MASTER_KEY not found in .env file');
  process.exit(1);
}

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
        PROMPTR_MASTER_KEY: JSON.stringify(apiKey)
      }
    })
  ]
}; 