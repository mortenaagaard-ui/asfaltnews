const axios = require('axios');

module.exports = async (req, res) => {
  // 1. Håndter CORS (vigtigt hvis du fetcher fra frontend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Håndter preflight-requests i browseren
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode ikke tilladt' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER || 'mortenaagaard-ui';
  const REPO_NAME = process.env.REPO_NAME || 'asfaltnews';
  const FILE_PATH = 'data/data.json';

  try {
    const { content } = req.body;
    let sha;

    // 2. Prøv at hente filen for at få SHA (hvis den findes)
    try {
      const getResponse = await axios.get(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      sha = getResponse.data.sha;
    } catch (getError) {
      if (getError.response?.status === 404) {
        // Filen findes ikke endnu, hvilket er okay. 'sha' forbliver undefined.
      } else {
        throw getError; // Kast andre fejl (f.eks. ugyldigt token) videre
      }
    }

    // 3. Opsæt payload. 
    const payload = {
      message: sha ? 'Opdater data.json via Vercel' : 'Opret data.json via Vercel',
      content: Buffer.from(content).toString('base64')
    };

    // Tilføj sha, hvis vi fandt en (påkrævet for at opdatere eksisterende filer)
    if (sha) {
      payload.sha = sha;
    }

    // 4. Send PUT-anmodning (GitHub bruger altid PUT til både oprettelse og opdatering)
    await axios.put(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      payload,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    return res.status(200).json({ success: true, message: 'Filen er gemt i GitHub.' });

  } catch (error) {
    console.error('Fejl:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
};
