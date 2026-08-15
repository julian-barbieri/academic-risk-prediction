const axios = require("axios");

async function pingAiService() {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

  try {
    await axios.get(`${aiServiceUrl}/health`, { timeout: 60000 });
  } catch {
    // best-effort: pf-ai puede estar dormido, caido, o tardar mas del
    // timeout. No importa, el objetivo es solo despertarlo.
  }
}

module.exports = { pingAiService };
