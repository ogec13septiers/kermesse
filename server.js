const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DATA_FILE = 'data.json';
const PORT = 3000;

const GITHUB_PAGES_ORIGIN = 'https://ogec13septiers.github.io';

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function githubRequest(method, url, token, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'kermesse-server'
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getFileSha(token, owner, repo, filePath) {
  try {
    const result = await githubRequest('GET', `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, token);
    if (result.status === 200 && result.data.sha) {
      return result.data.sha;
    }
  } catch {}
  return null;
}

async function saveToGithub(token, owner, repo, branch, content, filePath) {
  const sha = await getFileSha(token, owner, repo, filePath);
  const body = {
    message: `Mise à jour ${new Date().toISOString()}`,
    content: Buffer.from(content).toString('base64'),
    branch: branch
  };
  if (sha) body.sha = sha;

  return githubRequest('PUT', `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, token, body);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', GITHUB_PAGES_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const config = loadConfig();

  if (req.method === 'GET' && req.url === '/') {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Configuration Kermesse</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #fdf4ff; }
    h1 { color: #7c3aed; }
    .card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(124,58,237,0.1); border: 1px solid #e9d5ff; }
    .form { display: flex; flex-direction: column; gap: 15px; }
    label { font-weight: bold; color: #7c3aed; font-size: 0.9rem; }
    input { padding: 12px; border: 2px solid #e9d5ff; border-radius: 10px; font-size: 1rem; width: 100%; box-sizing: border-box; }
    input:focus { outline: none; border-color: #7c3aed; }
    button { padding: 14px; background: linear-gradient(135deg, #e84393, #7c3aed); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 1rem; width: 100%; }
    button:hover { transform: translateY(-1px); }
    .help { font-size: 0.85em; color: #666; margin-top: -10px; }
    .error { color: #ef4444; margin-top: 10px; padding: 12px; background: #fee2e2; border-radius: 8px; }
    .success { color: #10b981; margin-top: 10px; padding: 12px; background: #d1fae5; border-radius: 8px; }
    .info { background: #e0e7ff; padding: 12px; border-radius: 8px; font-size: 0.9rem; margin-bottom: 20px; }
    a { color: #7c3aed; }
  </style>
</head>
<body>
  <h1>🎪 Serveur Kermesse</h1>
  
  <div class="card">
    <div class="info">
      <strong>Fonctionnement :</strong><br>
      L'application est sur GitHub Pages.<br>
      Ce serveur synchronise les données avec le dépôt GitHub.
    </div>
    
    ${config ? `
      <div class="success">
        ✅ Connecté : <strong>${config.owner}/${config.repo}</strong> (branche ${config.branch})
      </div>
      <p style="margin-top:15px">
        Ouvrez l'application :<br>
        <a href="${GITHUB_PAGES_ORIGIN}/kermesse" target="_blank" style="font-size:1.2em;font-weight:bold">${GITHUB_PAGES_ORIGIN}/kermesse</a>
      </p>
      <form action="/api/config/reset" method="POST" style="margin-top:20px">
        <button type="submit" style="background:#ef4444;width:auto">🔄 Réinitialiser</button>
      </form>
    ` : `
      <form class="form" action="/api/config" method="POST">
        <div>
          <label>Propriétaire du repo</label>
          <input type="text" name="owner" placeholder="ogec13septiers" required value="ogec13septiers">
        </div>
        <div>
          <label>Nom du repo</label>
          <input type="text" name="repo" placeholder="kermesse" required value="kermesse">
        </div>
        <div>
          <label>Branche</label>
          <input type="text" name="branch" value="main">
        </div>
        <div>
          <label>Token GitHub</label>
          <input type="password" name="token" placeholder="ghp_..." required>
          <p class="help">Settings → Developer settings → PAT → Generate new token (cochez "repo")</p>
        </div>
        <button type="submit">Enregistrer</button>
      </form>
    `}
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/config') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const params = new URLSearchParams(body);
      const owner = params.get('owner');
      const repo = params.get('repo');
      const branch = params.get('branch') || 'main';
      const token = params.get('token');

      console.log('Config attempt:', { owner, repo, branch, tokenLength: token ? token.length : 0 });

      if (!token || token.length < 10) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p class="error">Token manquant ou trop court.</p><a href="/">Réessayer</a>');
        return;
      }

      try {
        const result = await githubRequest('GET', `https://api.github.com/repos/${owner}/${repo}`, token);
        console.log('GitHub response:', result.status, result.data);
        
        if (result.status === 401) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<p class="error">Token invalide. Vérifiez qu\'il n\'est pas expiré et qu\'il a les permissions "repo".</p><a href="/">Réessayer</a>');
          return;
        }
        
        if (result.status === 404) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<p class="error">Dépôt introuvable. Vérifiez le nom du repo.</p><a href="/">Réessayer</a>');
          return;
        }
        
        if (result.status === 403) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<p class="error">Accès refusé. Vérifiez que le token a les permissions "repo".</p><a href="/">Réessayer</a>');
          return;
        }

        if (result.status !== 200) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<p class="error">Erreur GitHub: ' + (result.data.message || result.status) + '</p><a href="/">Réessayer</a>');
          return;
        }

        saveConfig({ owner, repo, branch, token });
        res.writeHead(302, { 'Location': '/' });
        res.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p class="error">Erreur: ' + e.message + '</p><a href="/">Réessayer</a>');
      }
    });
    return;
  }

  if (!config) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Non configuré. Ouvrez http://localhost:' + PORT }));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/data') {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${DATA_FILE}`;
      const result = await githubRequest('GET', rawUrl, config.token);
      
      if (result.status === 200) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result.data);
      } else {
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Fichier non trouvé sur GitHub' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const content = JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          stands: data.stands,
          classes: data.classes,
          inscriptions: data.inscriptions
        }, null, 2);

        const result = await saveToGithub(config.token, config.owner, config.repo, config.branch, content, DATA_FILE);

        if (result.status === 200 || result.status === 201) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: result.data.message || 'Erreur GitHub' }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/config/reset') {
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch {}
    res.writeHead(302, { 'Location': '/' });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🎪 Serveur Kermesse`);
  console.log(`📡 API: http://localhost:${PORT}`);
  console.log(`🌐 Ouvrez http://localhost:${PORT} pour configurer\n`);
});
