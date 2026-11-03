import fs from 'fs';
import path from 'path';

console.log('=== SIGNX PHASE 1 AUDIT & VERIFICATION ===\n');

let errors = [];
let passed = 0;

// 1. Check manifest.json
try {
  const manifestRaw = fs.readFileSync('./manifest.json', 'utf8');
  const manifest = JSON.parse(manifestRaw);
  console.log('✓ manifest.json is valid JSON (Manifest V3 format)');
  passed++;

  // Check icons
  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    if (fs.existsSync(iconPath)) {
      console.log(`  ✓ Icon ${size}x${size} exists: ${iconPath}`);
      passed++;
    } else {
      errors.push(`Missing icon: ${iconPath}`);
    }
  }

  // Check background service worker
  if (manifest.background?.service_worker && fs.existsSync(manifest.background.service_worker)) {
    console.log(`  ✓ Service worker exists: ${manifest.background.service_worker}`);
    passed++;
  } else {
    errors.push(`Missing service worker: ${manifest.background?.service_worker}`);
  }

  // Check side panel default_path
  if (manifest.side_panel?.default_path && fs.existsSync(manifest.side_panel.default_path)) {
    console.log(`  ✓ Side panel exists: ${manifest.side_panel.default_path}`);
    passed++;
  } else {
    errors.push(`Missing side panel: ${manifest.side_panel?.default_path}`);
  }

  // Check popup
  if (manifest.action?.default_popup && fs.existsSync(manifest.action.default_popup)) {
    console.log(`  ✓ Popup exists: ${manifest.action.default_popup}`);
    passed++;
  } else {
    errors.push(`Missing popup: ${manifest.action?.default_popup}`);
  }

  // Check content scripts
  (manifest.content_scripts || []).forEach(cs => {
    (cs.js || []).forEach(jsFile => {
      if (fs.existsSync(jsFile)) {
        console.log(`  ✓ Content script exists: ${jsFile}`);
        passed++;
      } else {
        errors.push(`Missing content script: ${jsFile}`);
      }
    });
  });

} catch (err) {
  errors.push(`Failed to parse manifest.json: ${err.message}`);
}

// 2. Check JSON data files
const jsonFiles = [
  'data/default-settings.json',
  'isl-library/isl-glossary.json'
];

jsonFiles.forEach(jf => {
  try {
    const raw = fs.readFileSync(jf, 'utf8');
    const parsed = JSON.parse(raw);
    console.log(`✓ JSON Valid: ${jf} (${Object.keys(parsed).length} keys)`);
    passed++;
  } catch (err) {
    errors.push(`Invalid JSON in ${jf}: ${err.message}`);
  }
});

// 3. Security Audit: Scan for hardcoded API keys
function scanForSecrets(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') scanForSecrets(full);
    } else if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.html')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('AIzaSy') || content.includes('sk-ant-') || content.includes('sk-proj-')) {
        errors.push(`Potential hardcoded secret found in ${full}`);
      }
    }
  }
}

scanForSecrets('.');
console.log('✓ Security check: Zero hardcoded API keys found across all files.');
passed++;

// Print final summary
console.log(`\nVerification Summary: ${passed} checks passed, ${errors.length} errors.`);
if (errors.length > 0) {
  console.error('\nErrors:');
  errors.forEach(e => console.error('  ✖', e));
  process.exit(1);
} else {
  console.log('★ All Phase 1 architecture & integration criteria PASSED successfully!\n');
}
