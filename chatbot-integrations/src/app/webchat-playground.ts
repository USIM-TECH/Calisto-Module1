export function renderWebchatPlaygroundHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Calisto Web Chat Test</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: rgba(255, 255, 255, 0.88);
        --ink: #1f1a17;
        --muted: #6f6357;
        --line: rgba(31, 26, 23, 0.12);
        --accent: #184e3d;
        --accent-2: #d7a86e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(215, 168, 110, 0.22), transparent 32%),
          radial-gradient(circle at bottom right, rgba(24, 78, 61, 0.16), transparent 28%),
          linear-gradient(180deg, #f8f3ec 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .shell {
        width: min(920px, 100%);
        display: grid;
        gap: 18px;
      }
      .hero {
        padding: 20px 22px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(18px);
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 4vw, 3rem);
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        font-size: 1rem;
      }
      .chat {
        border: 1px solid var(--line);
        border-radius: 28px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 80px rgba(31, 26, 23, 0.08);
      }
      .messages {
        min-height: 460px;
        max-height: 60vh;
        overflow-y: auto;
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .message {
        max-width: 78%;
        padding: 12px 14px;
        border-radius: 18px;
        line-height: 1.45;
        border: 1px solid var(--line);
        white-space: pre-wrap;
      }
      .message.user {
        align-self: flex-end;
        background: var(--accent);
        color: #f5f2eb;
        border-color: transparent;
      }
      .message.bot {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.92);
      }
      .composer {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        padding: 18px;
        border-top: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.68);
      }
      textarea {
        width: 100%;
        min-height: 56px;
        max-height: 160px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        font: inherit;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.9);
      }
      button.send {
        border: 0;
        border-radius: 999px;
        padding: 0 22px;
        font: inherit;
        font-weight: 700;
        color: #fff8ef;
        background: linear-gradient(135deg, var(--accent), #266953);
        cursor: pointer;
      }
      .choices {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .choice {
        border: 1px solid rgba(24, 78, 61, 0.25);
        background: rgba(24, 78, 61, 0.08);
        color: var(--accent);
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        font: inherit;
      }
      .hint {
        padding: 0 4px 10px 4px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      @media (max-width: 640px) {
        .message { max-width: 92%; }
        .composer { grid-template-columns: 1fr; }
        button.send { min-height: 48px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <h1>Calisto Website Chat</h1>
        <p>Local playground for the website integration. It calls <code>/webchat/message</code> directly.</p>
      </section>
      <section class="chat">
        <div id="messages" class="messages"></div>
        <div class="composer">
          <div>
            <textarea id="messageInput" placeholder="Type a message like: hi"></textarea>
            <div class="hint">Reply buttons from Rasa will appear as clickable chips here.</div>
          </div>
          <button id="sendButton" class="send" type="button">Send</button>
        </div>
      </section>
    </div>
    <script>
      const senderId = "website-demo-user";
      const messagesEl = document.getElementById("messages");
      const inputEl = document.getElementById("messageInput");
      const sendButtonEl = document.getElementById("sendButton");

      function appendBubble(text, role) {
        const el = document.createElement("div");
        el.className = "message " + role;
        el.textContent = text;
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return el;
      }

      function appendChoiceMessage(message) {
        const bubble = appendBubble(message.text, "bot");
        const choices = document.createElement("div");
        choices.className = "choices";
        for (const option of message.options || []) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "choice";
          button.textContent = option.label;
          button.addEventListener("click", () => sendMessage(option.value, option.label));
          choices.appendChild(button);
        }
        bubble.appendChild(choices);
      }

      function appendImageMessage(message) {
        const bubble = document.createElement("div");
        bubble.className = "message bot";
        const img = document.createElement("img");
        img.src = message.imageUrl;
        img.alt = "Bot image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "14px";
        bubble.appendChild(img);
        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      async function sendMessage(rawValue, visibleText) {
        const text = String(rawValue || "").trim();
        if (!text) return;

        appendBubble(visibleText || text, "user");
        inputEl.value = "";
        sendButtonEl.disabled = true;

        try {
          const response = await fetch("/webchat/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderId, message: text })
          });

          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Request failed");
          }

          for (const message of payload.messages || []) {
            if (message.type === "choice") {
              appendChoiceMessage(message);
            } else if (message.type === "image") {
              appendImageMessage(message);
            } else if (message.type === "text") {
              appendBubble(message.text, "bot");
            }
          }
        } catch (error) {
          appendBubble("Request failed: " + error.message, "bot");
        } finally {
          sendButtonEl.disabled = false;
          inputEl.focus();
        }
      }

      sendButtonEl.addEventListener("click", () => sendMessage(inputEl.value));
      inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage(inputEl.value);
        }
      });

      appendBubble("Website playground ready. Try sending “hi”.", "bot");
    </script>
  </body>
</html>`
}
