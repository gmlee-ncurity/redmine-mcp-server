#!/usr/bin/env node

import { runServer } from './server.js';

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the server
runServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});