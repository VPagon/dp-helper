const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '../src/styles/pages'),
  path.join(__dirname, '../src/components/common'),
];

const replacements = [
  ['#ffffff', 'var(--color-surface)'],
  ['#FFFFFF', 'var(--color-surface)'],
  ['#fff', 'var(--color-surface)'],
  ['#f8f9fa', 'var(--color-surface-muted)'],
  ['#f9f9f9', 'var(--color-surface-muted)'],
  ['#f8f8f8', 'var(--color-code-bg)'],
  ['#f5f5f5', 'var(--color-bg-muted)'],
  ['#f2f2f2', 'var(--color-surface-muted)'],
  ['#f0f0f0', 'var(--color-border-subtle)'],
  ['#e9ecef', 'var(--color-border-subtle)'],
  ['#eee', 'var(--color-border-subtle)'],
  ['#e0e0e0', 'var(--color-border)'],
  ['#dee2e6', 'var(--color-border)'],
  ['#ddd', 'var(--color-border)'],
  ['#cccccc', 'var(--color-disabled-bg)'],
  ['#ccc', 'var(--color-disabled-bg)'],
  ['#2c3e50', 'var(--color-text-heading)'],
  ['#495057', 'var(--color-text-secondary)'],
  ['#333', 'var(--color-text)'],
  ['#666', 'var(--color-text-muted)'],
  ['#989898', 'var(--color-text-muted)'],
  ['#6c757d', 'var(--color-secondary)'],
  ['#999', 'var(--color-text-muted)'],
  ['#007bff', 'var(--color-primary)'],
  ['#0056b3', 'var(--color-primary-hover)'],
  ['#2196F3', 'var(--color-primary)'],
  ['#2196f3', 'var(--color-primary)'],
  ['#4CAF50', 'var(--color-accent)'],
  ['#45a049', 'var(--color-accent-hover)'],
  ['#28a745', 'var(--color-accent)'],
  ['#e3f2fd', 'var(--color-info-bg)'],
  ['#ffebee', 'var(--color-danger-bg)'],
  ['#f8d7da', 'var(--color-danger-bg)'],
  ['#f5c6cb', 'var(--color-danger-border)'],
  ['#721c24', 'var(--color-danger-text)'],
  ['#e8f5e9', 'var(--color-success-bg)'],
  ['#e8f5e8', 'var(--color-success-bg)'],
  ['#c3e6cb', 'var(--color-success-border)'],
  ['#f44336', 'var(--color-danger)'],
  ['#c62828', 'var(--color-danger-text)'],
  ['#d32f2f', 'var(--color-danger)'],
  ['#2e7d32', 'var(--color-success-text)'],
  ['color: red', 'color: var(--color-danger)'],
  ['color: white', 'color: var(--color-text-inverse)'],
  ['color: #fff', 'color: var(--color-text-inverse)'],
  ['rgba(0, 0, 0, 0.5)', 'var(--color-overlay)'],
  ['rgba(0, 0, 0, 0.1)', 'var(--shadow-sm)'],
  ['rgba(0,0,0,0.1)', 'var(--shadow-sm)'],
  ['#155724', 'var(--color-success-text)'],
  ['#856404', 'var(--color-warning-text)'],
  ['#d4edda', 'var(--color-success-bg)'],
  ['#dc3545', 'var(--color-danger)'],
  ['#c82333', 'var(--color-danger-text)'],
  ['#218838', 'var(--color-accent-hover)'],
  ['#1e7e34', 'var(--color-accent-hover)'],
  ['#545b62', 'var(--color-secondary-hover)'],
  ['#383d41', 'var(--color-text-secondary)'],
  ['#e2e3e5', 'var(--color-disabled-bg)'],
  ['#1565c0', 'var(--color-info-text)'],
  ['#ff9800', 'var(--color-chart-warn)'],
  ['#FF9800', 'var(--color-chart-warn)'],
  ['#f57c00', 'var(--color-chart-warn)'],
  ['#888', 'var(--color-text-muted)'],
  ['#e1e5e9', 'var(--color-border-subtle)'],
  ['#ced4da', 'var(--color-border)'],
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(css|scss)$/.test(entry.name) && !entry.name.startsWith('_tokens'))
      files.push(full);
  }
  return files;
}

let changed = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    if (file.includes('_home.scss') || file.includes('_insert-data') || file.includes('_recreate-table'))
      continue;
    let content = fs.readFileSync(file, 'utf8');
    const original = content;
    for (const [from, to] of replacements) {
      content = content.split(from).join(to);
    }
    if (content !== original) {
      fs.writeFileSync(file, content);
      changed++;
      console.log('Updated:', path.relative(process.cwd(), file));
    }
  }
}
console.log('Files updated:', changed);
