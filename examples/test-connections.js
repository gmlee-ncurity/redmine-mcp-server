#!/usr/bin/env node

/**
 * Simple script to test Redmine connection
 * Usage: REDMINE_URL=https://your-redmine.com REDMINE_API_KEY=your-key node test-connection.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check environment variables
if (!process.env.REDMINE_URL || !process.env.REDMINE_API_KEY) {
  console.error('Error: REDMINE_URL and REDMINE_API_KEY environment variables are required');
  console.error('Usage: REDMINE_URL=https://your-redmine.com REDMINE_API_KEY=your-key node test-connection.js');
  process.exit(1);
}

console.log('Testing Redmine MCP Server connection...');
console.log(`Redmine URL: ${process.env.REDMINE_URL}`);
console.log(`API Key: ${process.env.REDMINE_API_KEY.substring(0, 4)}...`);

// Build path to the server
const serverPath = join(__dirname, '..', 'dist', 'index.js');

// Spawn the MCP server
const server = spawn('node', [serverPath], {
  env: {
    ...process.env,
    LOG_LEVEL: 'debug',
  },
  stdio: 'pipe',
});

// Handle server output
server.stdout.on('data', (data) => {
  console.log(`Server: ${data}`);
});

server.stderr.on('data', (data) => {
  console.error(`Server Error: ${data}`);
});

server.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

// Test tools by sending MCP protocol messages
const testMessages = [
  // List tools
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  },
  // Get current user
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'redmine_get_current_user',
      arguments: {},
    },
  },
  // List projects
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'redmine_list_projects',
      arguments: {
        limit: 5,
      },
    },
  },
];

// Send test messages with delay
let messageIndex = 0;

function sendNextMessage() {
  if (messageIndex < testMessages.length) {
    const message = testMessages[messageIndex];
    console.log(`\nSending test message ${message.id}:`, message.method);
    server.stdin.write(JSON.stringify(message) + '\n');
    messageIndex++;
    
    // Wait for response before sending next
    setTimeout(sendNextMessage, 2000);
  } else {
    console.log('\nAll tests completed. Shutting down server...');
    server.kill();
    process.exit(0);
  }
}

// Start testing after server initializes
setTimeout(() => {
  console.log('\nStarting tests...');
  sendNextMessage();
}, 1000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.kill();
  process.exit(0);
});