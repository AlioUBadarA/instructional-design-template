const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://YOUR_USERNAME.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3001',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o => origin.startsWith(o));
    if (allowed) return callback(null, true);
    callback(new Error(`CORS bloqué pour: ${origin}`));
  }
}));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'myAgro Claude Proxy',
    version: '1.0.0',
    frontend: process.env.FRONTEND_URL || 'non configuré'
  });
});

app.post('/api/claude', async (req, res) => {
  const { prompt, system, max_tokens = 1000 } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Le champ prompt est requis.' });
  }
  if (prompt.length > 8000) {
    return res.status(400).json({ error: 'Prompt trop long (max 8000 caractères).' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY manquante dans .env');
    return res.status(500).json({ error: 'Clé API non configurée côté serveur.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: Math.min(max_tokens, 2000),
        system: system || `Tu es Claude, assistant expert intégré dans le système de design pédagogique de myAgro.
Tu maîtrises: le framework ADDIE cyclique, l'Agile-Scrum adapté au terrain, la pédagogie pour apprenants
à faible littératie en Afrique de l'Ouest, les pratiques agricoles sahéliennes (arachide, mil, maïs, sorgho),
et les valeurs myAgro (agriculteurs comme clients, innovation fondée sur les données, impact mesurable).
Réponds de manière concise, structurée, ancrée dans la réalité du terrain sénégalais.
Utilise des émojis pertinents pour structurer. Maximum 300 mots.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', errData);
      return res.status(response.status).json({
        error: errData.error?.message || `Erreur Anthropic API (${response.status})`
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    res.json({ text });

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: 'Erreur serveur interne. Réessayez.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route non trouvée: ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`✅  myAgro Claude Proxy — port ${PORT}`);
  console.log(`🌱  Frontend autorisé: ${allowedOrigins[0]}`);
  console.log(`🔑  Clé API: ${process.env.ANTHROPIC_API_KEY ? '✅ configurée' : '❌ MANQUANTE'}`);
});
