const axios = require('axios');

module.exports = async (req, res) => {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER || 'mortenaagaard-ui';
  const REPO_NAME = process.env.REPO_NAME || 'asfaltnews';
  const FILE_PATH = 'data/data.json';

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode ikke tilladt' });
  }

  try {
    const { content } = req.body;

    // 1. Hent filens aktuelle SHA
    const getResponse = await axios.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    const sha = getResponse.data.sha;

    // 2. Opdater filen
    await axios.put(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        message: 'Opdater data.json via frontend',
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

    res.status(200).json({ success: true, message: 'Filen er opdateret.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
