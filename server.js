import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure bundle exists on startup
const editorBundle = path.join(__dirname, 'website', 'beepbox_editor.min.js');
if (!fs.existsSync(editorBundle)) {
  console.log('Building BeepBox assets...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('Failed to build assets on startup:', err);
  }
}

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'website')));

app.get('*', (req, res) => {
  // If requesting a missing static file with extension, return 404 instead of index.html
  if (path.extname(req.path)) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BeepBox server running on http://0.0.0.0:${PORT}`);
});

