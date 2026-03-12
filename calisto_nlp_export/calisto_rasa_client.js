/**
 * Calisto Eyewear – Node.js ↔ Rasa NLP Integration
 * ==================================================
 * Drop this into your Node/Express backend to connect
 * to the Rasa NLP service running on localhost:5005.
 *
 * Install: npm install axios express
 * Run:     node calisto_rasa_client.js
 */

const express = require("express");
const axios   = require("axios");

const app        = express();
const RASA_URL   = process.env.RASA_URL || "http://localhost:5005";
const PORT       = process.env.PORT     || 3000;

app.use(express.json());

// ── In-memory session store (replace with Redis in production) ──
const sessions = {};

/**
 * POST /chat
 * Body: { "userId": "user123", "message": "I need glasses" }
 * Returns: { "replies": [ { "text": "..." }, ... ] }
 */
app.post("/chat", async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }

  // Sanitise input (basic XSS / injection guard)
  const safeMessage = String(message).slice(0, 1000).trim();
  const safeSender  = String(userId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);

  try {
    const response = await axios.post(
      `${RASA_URL}/webhooks/rest/webhook`,
      { sender: safeSender, message: safeMessage },
      { timeout: 10000 }
    );

    const replies = response.data; // Array of { text, image, buttons, ... }
    return res.json({ replies });

  } catch (err) {
    console.error("Rasa error:", err.message);
    return res.status(502).json({ error: "NLP service unavailable" });
  }
});

/**
 * POST /chat/reset
 * Body: { "userId": "user123" }
 * Resets the conversation session for a user.
 */
app.post("/chat/reset", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  const safeSender = String(userId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);

  try {
    // Tell Rasa to restart the conversation tracker for this sender
    await axios.post(`${RASA_URL}/conversations/${safeSender}/tracker/events`, [
      { event: "restart" }
    ]);
    res.json({ status: "session reset" });
  } catch (err) {
    res.status(502).json({ error: "Could not reset session" });
  }
});

/**
 * GET /health
 * Returns status of both Node server and Rasa NLP service.
 */
app.get("/health", async (req, res) => {
  try {
    const rasaHealth = await axios.get(`${RASA_URL}/health`, { timeout: 3000 });
    res.json({
      node:  "ok",
      rasa:  rasaHealth.data.status || "ok",
      rasa_url: RASA_URL,
    });
  } catch {
    res.status(502).json({ node: "ok", rasa: "unreachable", rasa_url: RASA_URL });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Calisto Node API running on http://localhost:${PORT}`);
  console.log(`   Connected to Rasa NLP at: ${RASA_URL}`);
  console.log(`   POST /chat       → send message`);
  console.log(`   POST /chat/reset → reset user session`);
  console.log(`   GET  /health     → service status`);
});

// ── Usage Example ───────────────────────────────────────────
//
//  curl -X POST http://localhost:3000/chat \
//    -H "Content-Type: application/json" \
//    -d '{"userId": "user1", "message": "hi"}'
//
//  Response:
//  {
//    "replies": [
//      { "text": "Welcome to Calisto Eyewear! ..." }
//    ]
//  }
