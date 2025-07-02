#!/usr/bin/env node

/**
 * DXT Validation Script
 * Validates the DXT package structure and manifest before packaging
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const validateDXT = () => {
  console.log('🔍 Validating DXT package structure...\n');
  
  let errors = [];
  let warnings = [];
  
  // Check required files
  const requiredFiles = [
    'manifest.json',
    'dist/index.js',
    'package.json',
    'README.md'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    } else {
      console.log(`✅ Found: ${file}`);
    }
  }
  
  // Validate manifest.json
  try {
    const manifestPath = path.join(projectRoot, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    console.log('\\n📋 Validating manifest.json...');
    
    // Required fields
    const requiredFields = ['dxt_version', 'name', 'version', 'description', 'author', 'server'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        errors.push(`Manifest missing required field: ${field}`);
      } else {
        console.log(`✅ Manifest has: ${field}`);
      }
    }
    
    // Validate server configuration
    if (manifest.server) {
      const server = manifest.server;
      if (!server.type || !server.entry_point || !server.mcp_config) {
        errors.push('Server configuration incomplete');
      } else {
        console.log('✅ Server configuration valid');
      }
      
      // Check entry point exists
      const entryPath = path.join(projectRoot, server.entry_point);
      if (!fs.existsSync(entryPath)) {
        errors.push(`Entry point not found: ${server.entry_point}`);
      } else {
        console.log(`✅ Entry point exists: ${server.entry_point}`);
      }
    }
    
    // Validate user_config
    if (manifest.user_config) {
      console.log(`✅ User configuration defined with ${Object.keys(manifest.user_config).length} options`);
    } else {
      warnings.push('No user configuration defined');
    }
    
    // Validate tools
    if (manifest.tools && Array.isArray(manifest.tools)) {
      console.log(`✅ Tools defined: ${manifest.tools.length} tools`);
    } else {
      warnings.push('No tools defined in manifest');
    }
    
  } catch (error) {
    errors.push(`Failed to parse manifest.json: ${error.message}`);
  }
  
  // Check package.json
  try {
    const packagePath = path.join(projectRoot, 'package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(packageContent);
    
    console.log('\\n📦 Validating package.json...');
    
    if (pkg.type === 'module') {
      console.log('✅ ES modules configured');
    } else {
      warnings.push('Package not configured for ES modules');
    }
    
    if (pkg.engines && pkg.engines.node) {
      console.log(`✅ Node.js version requirement: ${pkg.engines.node}`);
    } else {
      warnings.push('No Node.js version requirement specified');
    }
    
  } catch (error) {
    errors.push(`Failed to parse package.json: ${error.message}`);
  }
  
  // Check dist directory
  const distPath = path.join(projectRoot, 'dist');
  if (fs.existsSync(distPath)) {
    const distFiles = fs.readdirSync(distPath);
    console.log(`\\n🏗️  Dist directory contains ${distFiles.length} files`);
    
    // Check for essential files
    const essentialDistFiles = ['index.js', 'server.js', 'config.js'];
    for (const file of essentialDistFiles) {
      if (distFiles.includes(file)) {
        console.log(`✅ Dist has: ${file}`);
      } else {
        warnings.push(`Dist missing: ${file}`);
      }
    }
  } else {
    errors.push('Dist directory not found - run npm run build');
  }
  
  // Summary
  console.log('\\n📊 Validation Summary:');
  console.log(`✅ Checks passed: ${requiredFiles.length - errors.length}/${requiredFiles.length}`);
  
  if (warnings.length > 0) {
    console.log('\\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  if (errors.length > 0) {
    console.log('\\n❌ Errors:');
    errors.forEach(error => console.log(`   - ${error}`));
    console.log('\\n❌ DXT validation failed!');
    process.exit(1);
  } else {
    console.log('\\n🎉 DXT validation successful!');
    console.log('\\n📦 Ready for packaging with: dxt pack .');
  }
};

validateDXT();