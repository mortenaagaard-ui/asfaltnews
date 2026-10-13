const axios = require('axios');

module.exports = async (req, res) => {
  // CORS-headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // Kan begrænses til dit domæne senere
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode ikke tilladt' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const FILE_PATH = 'data/data.json';

  try {
    // 1. Modtag det nye dataobjekt fra frontend
    const { newData } = req.body;

    if (!newData) {
      return res.status(400).json({ error: 'Mangler newData i request body' });
    }

    let sha;
    let eksisterendeData = [];

    // 2. Hent den eksisterende fil fra GitHub
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
      
      // GitHub returnerer filen som Base64. Vi afkoder den til en tekststreng (UTF-8).
      const decodedContent = Buffer.from(getResponse.data.content, 'base64').toString('utf-8');
      
      // Parse teksten til et JavaScript array
      if (decodedContent) {
         eksisterendeData = JSON.parse(decodedContent);
         
         // Sikkerhedstjek: Hvis filen ikke er et array (f.eks. et objekt), laver vi det til et array
         if (!Array.isArray(eksisterendeData)) {
             eksisterendeData = [eksisterendeData]; 
         }
      }
    } catch (getError) {
      if (getError.response?.status === 404) {
        // Hvis filen ikke findes, fortsætter vi blot med det tomme array: []
      } else {
        throw getError;
      }
    }

    // 3. Push det nye element ind i bunden af arrayet
    eksisterendeData.push(newData);

    // 4. Konverter hele det opdaterede array tilbage til en formateret JSON-streng og derefter til Base64
    const opdateretContentStr = JSON.stringify(eksisterendeData, null, 2);
    const base64Content = Buffer.from(opdateretContentStr, 'utf-8').toString('base64');

    // 5. Send den opdaterede fil tilbage til GitHub via PUT
    const payload = {
      message: 'Tilføjer nyt element til data.json via Vercel',
      content: base64Content
    };

    if (sha) {
      payload.sha = sha; // Påkrævet for at overskrive den eksisterende fil
    }

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

    return res.status(200).json({ success: true, message: 'Data blev pushet til arkivet.' });

  } catch (error) {
    console.error('Fejl:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
};
