const axios = require('axios');

module.exports = async (req, res) => {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER || 'mortenaagaard-ui';
  const REPO_NAME = process.env.REPO_NAME || 'asfaltnews';
  const FILE_PATH = 'data/data.json';

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Metode ikke tilladt' });
  }

  try {
    const { content } = req.body;

    // Prøv at hente filen (for at få SHA)
    let sha;
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
      // Hvis filen ikke eksisterer (404), opret den med POST
      if (getError.response?.status === 404) {
        await axios.post(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
          {
            message: 'Opret data.json via Vercel Function',
            content: Buffer.from(content).toString('base64')
          },
          {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        // CORS-headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).json({ success: true, message: 'Filen er oprettet i GitHub.' });
      } else {
        // Andre fejl (f.eks. 401/403)
        throw getError;
      }
    }

    // Opdater filen (hvis den eksisterer)
    await axios.put(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        message: 'Opdater data.json via Vercel Function',
        content: Buffer.from(content).toString('base64'),
        sha: sha
      },
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    // CORS-headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json({ success: true, message: 'Filen er opdateret i GitHub.' });

  } catch (error) {
    console.error('Fejl:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
};
