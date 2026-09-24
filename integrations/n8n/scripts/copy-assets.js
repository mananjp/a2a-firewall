const fs = require('fs');
const path = require('path');

const icon = path.join(__dirname, '..', 'assets', 'a2aFirewall.svg');
const nodesDir = path.join(__dirname, '..', 'dist', 'nodes');

if (fs.existsSync(nodesDir)) {
  for (const entry of fs.readdirSync(nodesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'shared') {
      fs.copyFileSync(icon, path.join(nodesDir, entry.name, 'a2aFirewall.svg'));
    }
  }
  console.log('Assets copied.');
}
