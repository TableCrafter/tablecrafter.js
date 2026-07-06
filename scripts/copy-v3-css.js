const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'src', 'render', 'dom.css');
const dest = path.join(__dirname, '..', 'dist', 'v3', 'styles.css');

if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const size = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`CSS -> dist/v3/styles.css (${size} KB)`);
} else {
  console.warn('No CSS source found at', src);
}
