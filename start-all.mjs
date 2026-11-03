/**
 * SignX - Unified Development & Preview Launcher
 * Starts both:
 * 1. Backend Service (Port 3001 - YouTube API, Ollama ISL Synthesis)
 * 2. Web Preview Server (Port 3000 - SignX 3D Avatar & Interactive Interface)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('======================================================');
console.log('🚀 Starting SignX Indian Sign Language (ISL) Platform...');
console.log('======================================================');

// 1. Spawn Backend Service
const backendProcess = spawn(process.execPath, [path.join(__dirname, 'backend', 'server.js')], {
  stdio: 'inherit',
  cwd: path.join(__dirname, 'backend')
});

// 2. Spawn Web Preview Server
const previewProcess = spawn(process.execPath, [path.join(__dirname, 'preview-server.mjs')], {
  stdio: 'inherit',
  cwd: __dirname
});

function cleanup() {
  console.log('\n🛑 Stopping SignX servers...');
  try { backendProcess.kill(); } catch (e) {}
  try { previewProcess.kill(); } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
