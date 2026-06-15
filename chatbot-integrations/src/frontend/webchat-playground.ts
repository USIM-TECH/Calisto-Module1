import { renderAppShell } from './leads-dashboard.js'

export function renderWebchatPlaygroundHtml(): string {
  const content = `
    <main class="page">
      <header class="page-header">
        <div class="page-title">Website Chat Console</div>
        <div class="header-actions">
          <button class="btn">Reset Session</button>
          <button class="btn dark">Live Test</button>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <section class="metric-grid" style="margin-bottom:24px;">
            <article class="metric-card blue">
              <div class="metric-head">
                <span class="metric-label">Channel</span>
                <span>◌</span>
              </div>
              <div class="metric-value" style="font-size:1.8rem;">Website</div>
              <div class="metric-note">Directly calls <strong>/webchat/message</strong></div>
            </article>
            <article class="metric-card green">
              <div class="metric-head">
                <span class="metric-label">Session</span>
                <span>◌</span>
              </div>
              <div class="metric-value" id="sessionLabel" style="font-size:1.8rem;">demo-user</div>
              <div class="metric-note">Sender id used for local testing</div>
            </article>
            <article class="metric-card amber">
              <div class="metric-head">
                <span class="metric-label">Status</span>
                <span>◌</span>
              </div>
              <div class="metric-value" id="statusLabel" style="font-size:1.8rem;">Ready</div>
              <div class="metric-note">Replies appear in the conversation panel</div>
            </article>
          </section>

          <section class="detail-grid">
            <article class="panel">
              <div class="panel-head">
                <div class="panel-title">Test Controls</div>
              </div>
              <div class="panel-body">
                <div class="overview-grid">
                  <div>
                    <div class="field-label">Sender ID</div>
                    <input id="senderIdInput" class="note-input" type="text" value="website-demo-user" />
                  </div>
                  <div>
                    <div class="field-label">Suggested Prompts</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;">
                      <button class="btn prompt-chip" type="button" data-prompt="hi">hi</button>
                      <button class="btn prompt-chip" type="button" data-prompt="/browse_eyewear">browse eyewear</button>
                      <button class="btn prompt-chip" type="button" data-prompt="/find_a_store">find a store</button>
                    </div>
                  </div>
                  <div style="grid-column:1 / -1;">
                    <div class="field-label">Request Composer</div>
                    <textarea id="messageInput" class="chat-input" placeholder="Type a message like: hi"></textarea>
                    <div style="margin-top:12px;display:flex;gap:12px;justify-content:flex-end;">
                      <button id="clearChatButton" class="btn" type="button">Clear Chat</button>
                      <button id="sendButton" class="btn dark" type="button">Send Message</button>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel transcript">
              <div class="panel-head">
                <div class="panel-title">Conversation Preview</div>
                <span id="messageCountLabel" style="color:#9ca3af;font-size:0.72rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">1 Message</span>
              </div>
              <div id="messages" class="transcript-list"></div>
              <div class="transcript-footer">
                <div style="color:#6b7280;font-size:0.82rem;">Reply buttons from Rasa will show as clickable chips inside the assistant bubbles.</div>
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
    <style>
      .chat-input {
        width: 100%;
        min-height: 112px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #f9fafb;
        padding: 14px;
        font: inherit;
        color: var(--text);
      }

      .prompt-chip {
        padding: 8px 12px;
        border-radius: 999px;
      }

      .choice-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .choice-button {
        border: 1px solid #bfdbfe;
        background: #eff6ff;
        color: #1d4ed8;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
      }

      .bubble img {
        max-width: 100%;
        border-radius: 14px;
        display: block;
      }
      .card-list {
        display: grid;
        gap: 10px;
        margin-top: 10px;
      }
      .card-item {
        border: 1px solid #dbe3f0;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
        border-radius: 16px;
        padding: 14px;
      }
      .card-media {
        width: calc(100% + 28px);
        margin: -14px -14px 14px;
        display: block;
        border-radius: 16px 16px 0 0;
        object-fit: cover;
        max-height: 220px;
      }
      .card-title {
        font-size: 0.92rem;
        font-weight: 800;
        color: #111827;
        margin-bottom: 6px;
      }
      .card-subtitle {
        white-space: pre-line;
        color: #4b5563;
        font-size: 0.82rem;
        line-height: 1.55;
      }
      .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .card-action {
        border: 1px solid #dbe3f0;
        background: #ffffff;
        color: #0f172a;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.78rem;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }
    </style>
    <script>
      const messagesEl = document.getElementById('messages');
      const senderIdInput = document.getElementById('senderIdInput');
      const messageInput = document.getElementById('messageInput');
      const sendButton = document.getElementById('sendButton');
      const clearChatButton = document.getElementById('clearChatButton');
      const statusLabel = document.getElementById('statusLabel');
      const sessionLabel = document.getElementById('sessionLabel');
      const messageCountLabel = document.getElementById('messageCountLabel');
      const promptButtons = Array.from(document.querySelectorAll('[data-prompt]'));

      function updateMessageCount() {
        const count = messagesEl.querySelectorAll('.bubble-wrap').length;
        messageCountLabel.textContent = count + ' Message' + (count === 1 ? '' : 's');
      }

      function linkifyText(raw) {
        var s = String(raw || '');
        var urlRe = new RegExp('(https?://[^\\s<>"]+)', 'g');
        var parts = s.split(urlRe);
        var result = '';
        for (var i = 0; i < parts.length; i++) {
          if (urlRe.test(parts[i])) {
            var u = parts[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            result += '<a href="' + u + '" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">' + u + '</a>';
          } else {
            result += parts[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
          }
        }
        return result;
      }

      function appendBubble(text, direction) {
        const wrapper = document.createElement('div');
        wrapper.className = 'bubble-wrap ' + direction;

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + direction;
        bubble.innerHTML = linkifyText(String(text || ''));

        const meta = document.createElement('span');
        meta.className = 'bubble-meta';
        meta.textContent = (direction === 'outbound' ? 'Outbound (AI Assistant)' : 'Inbound') + ' • ' + new Date().toLocaleString('en-MY');

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        updateMessageCount();
        return bubble;
      }

      function appendImageBubble(imageUrl) {
        const wrapper = document.createElement('div');
        wrapper.className = 'bubble-wrap outbound';

        const bubble = document.createElement('div');
        bubble.className = 'bubble outbound';

        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'Bot image';
        bubble.appendChild(image);

        const meta = document.createElement('span');
        meta.className = 'bubble-meta';
        meta.textContent = 'Outbound (AI Assistant) • ' + new Date().toLocaleString('en-MY');

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        updateMessageCount();
      }

      function appendChoiceBubble(message) {
        const bubble = appendBubble(message.text || '', 'outbound');
        const choices = document.createElement('div');
        choices.className = 'choice-group';

        (message.options || []).forEach((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'choice-button';
          button.textContent = option.label;
          button.addEventListener('click', (e) => {
            // Disable all choice buttons in this group to prevent double-clicks
            const allChoiceButtons = choices.querySelectorAll('.choice-button');
            allChoiceButtons.forEach(btn => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              btn.style.cursor = 'not-allowed';
            });
            sendMessage(option.value, option.label);
          });
          choices.appendChild(button);
        });

        bubble.appendChild(choices);
      }

      function appendCardBubble(message) {
        const bubble = appendBubble('', 'outbound');
        const list = document.createElement('div');
        list.className = 'card-list';

        const card = document.createElement('div');
        card.className = 'card-item';

        if (message.imageUrl) {
          const image = document.createElement('img');
          image.className = 'card-media';
          image.src = message.imageUrl;
          image.alt = message.title || 'Card image';
          card.appendChild(image);
        }

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = message.title || 'Result';
        card.appendChild(title);

        if (message.subtitle) {
          const subtitle = document.createElement('div');
          subtitle.className = 'card-subtitle';
          subtitle.textContent = message.subtitle;
          card.appendChild(subtitle);
        }

        if ((message.actions || []).length) {
          const actions = document.createElement('div');
          actions.className = 'card-actions';

          (message.actions || []).forEach((action) => {
            if (action.type === 'url') {
              const link = document.createElement('a');
              link.className = 'card-action';
              link.href = action.value;
              link.target = '_blank';
              link.rel = 'noreferrer';
              link.textContent = action.title;
              actions.appendChild(link);
            } else {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'card-action';
              button.textContent = action.title;
              button.addEventListener('click', (e) => {
                // Disable this specific button to prevent double-clicks
                button.disabled = true;
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
                sendMessage(action.value, action.title);
              });
              actions.appendChild(button);
            }
          });

          card.appendChild(actions);
        }

        list.appendChild(card);
        bubble.appendChild(list);
      }

      async function sendMessage(rawValue, visibleText) {
        const text = String(rawValue || '').trim();
        const senderId = String(senderIdInput.value || '').trim() || 'website-demo-user';
        if (!text) return;

        appendBubble(visibleText || text, 'inbound');
        messageInput.value = '';
        sendButton.disabled = true;
        statusLabel.textContent = 'Sending';
        sessionLabel.textContent = senderId;

        try {
          const response = await fetch('/webchat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId, message: text }),
          });

          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || 'Request failed');
          }

          for (const message of payload.messages || []) {
            if (message.type === 'choice') {
              appendChoiceBubble(message);
            } else if (message.type === 'card') {
              appendCardBubble(message);
            } else if (message.type === 'image') {
              appendImageBubble(message.imageUrl);
            } else if (message.type === 'text') {
              appendBubble(message.text, 'outbound');
            }
          }

          statusLabel.textContent = 'Ready';
        } catch (error) {
          appendBubble('Request failed: ' + error.message, 'outbound');
          statusLabel.textContent = 'Error';
        } finally {
          sendButton.disabled = false;
          messageInput.focus();
        }
      }

      sendButton.addEventListener('click', () => sendMessage(messageInput.value));
      clearChatButton.addEventListener('click', () => {
        messagesEl.innerHTML = '';
        appendBubble('Website chat ready. Try sending “hi”.', 'outbound');
        statusLabel.textContent = 'Ready';
      });

      promptButtons.forEach((button) => {
        button.addEventListener('click', () => {
          sendMessage(button.dataset.prompt || '', button.textContent || '');
        });
      });

      messageInput.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey) {
          event.preventDefault();
          sendMessage(messageInput.value);
        }
      });

      appendBubble('Website chat ready. Try sending “hi”.', 'outbound');
    </script>
  `

  return renderAppShell('Website Chat Console', content, 'webchat')
}

export function renderCustomerWebchatHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Calisto Webchat</title>
    <style>
      :root {
        --bg: #f6f4f1;
        --panel: rgba(255, 255, 255, 0.9);
        --panel-strong: #ffffff;
        --text: #1f2937;
        --muted: #6b7280;
        --line: rgba(17, 24, 39, 0.08);
        --brand: #111111;
        --accent: #d97706;
        --user: #111111;
        --assistant: #f3f4f6;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(217, 119, 6, 0.12), transparent 25%),
          radial-gradient(circle at bottom right, rgba(17, 24, 39, 0.08), transparent 22%),
          linear-gradient(180deg, #faf8f5 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .shell {
        width: min(1080px, 100%);
        display: grid;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        gap: 20px;
      }

      .hero,
      .chat-shell {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(18px);
        box-shadow: 0 20px 60px rgba(17, 24, 39, 0.08);
      }

      .hero {
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: var(--brand);
        color: white;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 0.98;
        letter-spacing: -0.05em;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
        font-size: 0.98rem;
      }

      .hero-list {
        display: grid;
        gap: 10px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .hero-list li {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text);
        font-weight: 600;
      }

      .hero-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--accent);
      }

      .chat-shell {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 720px;
      }

      .chat-head {
        padding: 20px 22px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.7);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .chat-title {
        font-size: 1rem;
        font-weight: 800;
      }

      .chat-subtitle {
        color: var(--muted);
        font-size: 0.82rem;
        margin-top: 4px;
      }

      .status-pill {
        border: 1px solid rgba(16, 185, 129, 0.18);
        background: rgba(16, 185, 129, 0.1);
        color: #047857;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .messages {
        flex: 1;
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow-y: auto;
      }

      .bubble-wrap {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .bubble-wrap.user {
        align-items: flex-end;
      }

      .bubble-wrap.bot {
        align-items: flex-start;
      }

      .bubble {
        max-width: 82%;
        padding: 14px 16px;
        border-radius: 20px;
        font-size: 0.95rem;
        line-height: 1.55;
        white-space: pre-wrap;
        box-shadow: 0 8px 24px rgba(17, 24, 39, 0.04);
      }

      .bubble.user {
        background: var(--user);
        color: white;
        border-top-right-radius: 6px;
      }

      .bubble.bot {
        background: var(--assistant);
        color: var(--text);
        border-top-left-radius: 6px;
      }

      .meta {
        color: #9ca3af;
        font-size: 0.72rem;
        font-weight: 600;
      }

      .bubble img {
        max-width: 100%;
        border-radius: 14px;
        display: block;
      }

      .choices {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .choice {
        border: 1px solid rgba(17, 24, 39, 0.1);
        background: white;
        color: var(--text);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
      }

      .composer {
        border-top: 1px solid var(--line);
        padding: 18px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        background: rgba(255, 255, 255, 0.76);
      }

      .composer textarea {
        width: 100%;
        min-height: 60px;
        max-height: 160px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        font: inherit;
        color: var(--text);
        background: white;
      }

      .composer button {
        border: 0;
        border-radius: 16px;
        padding: 0 20px;
        min-width: 112px;
        font: inherit;
        font-weight: 800;
        color: white;
        background: linear-gradient(135deg, #111111, #2d2d2d);
        cursor: pointer;
      }

      .footnote {
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.8rem;
      }
      .chat-card {
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(255, 255, 255, 0.95);
        border-radius: 20px;
        padding: 16px;
      }
      .chat-card-media {
        width: calc(100% + 32px);
        margin: -16px -16px 16px;
        display: block;
        border-radius: 20px 20px 0 0;
        object-fit: cover;
        max-height: 240px;
      }
      .chat-card-title {
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 6px;
      }
      .chat-card-subtitle {
        white-space: pre-line;
        color: #475569;
        font-size: 0.92rem;
        line-height: 1.6;
      }
      .chat-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .chat-card-action {
        border-radius: 999px;
        border: 1px solid rgba(251, 146, 60, 0.35);
        background: rgba(255, 247, 237, 0.95);
        color: #c2410c;
        font-size: 0.78rem;
        font-weight: 800;
        padding: 8px 12px;
        text-decoration: none;
        cursor: pointer;
      }

      @media (max-width: 920px) {
        .shell {
          grid-template-columns: 1fr;
        }
        .chat-shell {
          min-height: 640px;
        }
      }

      @media (max-width: 640px) {
        body { padding: 12px; }
        .hero, .chat-shell { border-radius: 18px; }
        .composer { grid-template-columns: 1fr; }
        .composer button { min-height: 50px; }
        .bubble { max-width: 92%; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="brand">
          <span class="brand-mark">C</span>
          <span>Calisto Eyewear</span>
        </div>
        <div>
          <h1>Your eyewear assistant, on the website.</h1>
          <p>Ask about designer frames, lens options, store locations, appointments, or after-sales support. The same bot flow used across your channels is available here for customers.</p>
        </div>
        <ul class="hero-list">
          <li><span class="hero-dot"></span>Product discovery and recommendations</li>
          <li><span class="hero-dot"></span>Store finder and booking flow</li>
          <li><span class="hero-dot"></span>Lead capture for follow-up</li>
        </ul>
      </section>

      <section class="chat-shell">
        <div class="chat-head">
          <div>
            <div class="chat-title">Website Support Chat</div>
            <div class="chat-subtitle">Start with “hi” or choose a guided option when it appears.</div>
          </div>
          <div class="status-pill" id="statusLabel">Ready</div>
        </div>
        <div id="messages" class="messages"></div>
        <div class="composer">
          <div>
            <textarea id="messageInput" placeholder="Type your message..."></textarea>
            <div class="footnote">Your replies here go to <code>/webchat/message</code>.</div>
          </div>
          <button id="sendButton" type="button">Send</button>
        </div>
      </section>
    </div>
    <script>
      let senderId = localStorage.getItem('calisto_webchat_senderId');
      if (!senderId) {
        senderId = 'website-' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('calisto_webchat_senderId', senderId);
      }
      const messagesEl = document.getElementById('messages');
      const messageInput = document.getElementById('messageInput');
      const sendButton = document.getElementById('sendButton');
      const statusLabel = document.getElementById('statusLabel');

      function linkifyText(raw) {
        var s = String(raw || '');
        var urlRe = new RegExp('(https?://[^\\s<>"]+)', 'g');
        var parts = s.split(urlRe);
        var result = '';
        for (var i = 0; i < parts.length; i++) {
          if (urlRe.test(parts[i])) {
            var u = parts[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            result += '<a href="' + u + '" target="_blank" rel="noopener noreferrer" style="color:#d97706;text-decoration:underline;">' + u + '</a>';
          } else {
            result += parts[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
          }
        }
        return result;
      }

      function appendBubble(text, role) {
        const wrapper = document.createElement('div');
        wrapper.className = 'bubble-wrap ' + role;

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + role;
        bubble.innerHTML = linkifyText(String(text || ''));

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = (role === 'user' ? 'You' : 'Calisto Assistant') + ' • ' + new Date().toLocaleString('en-MY');

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return bubble;
      }

      function appendImageBubble(imageUrl) {
        const wrapper = document.createElement('div');
        wrapper.className = 'bubble-wrap bot';

        const bubble = document.createElement('div');
        bubble.className = 'bubble bot';

        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'Bot image';
        bubble.appendChild(image);

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = 'Calisto Assistant • ' + new Date().toLocaleString('en-MY');

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function appendChoiceBubble(message) {
        const bubble = appendBubble(message.text || '', 'bot');
        const choices = document.createElement('div');
        choices.className = 'choices';

        (message.options || []).forEach((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'choice';
          button.textContent = option.label;
          button.addEventListener('click', (e) => {
            // Disable all choice buttons in this bubble to prevent double-clicks
            const allChoiceButtons = choices.querySelectorAll('.choice');
            allChoiceButtons.forEach(btn => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              btn.style.cursor = 'not-allowed';
            });
            sendMessage(option.value, option.label);
          });
          choices.appendChild(button);
        });

        bubble.appendChild(choices);
      }

      function appendCardBubble(message) {
        const bubble = appendBubble('', 'bot');
        const card = document.createElement('div');
        card.className = 'chat-card';

        if (message.imageUrl) {
          const image = document.createElement('img');
          image.className = 'chat-card-media';
          image.src = message.imageUrl;
          image.alt = message.title || 'Card image';
          card.appendChild(image);
        }

        const title = document.createElement('div');
        title.className = 'chat-card-title';
        title.textContent = message.title || 'Result';
        card.appendChild(title);

        if (message.subtitle) {
          const subtitle = document.createElement('div');
          subtitle.className = 'chat-card-subtitle';
          subtitle.textContent = message.subtitle;
          card.appendChild(subtitle);
        }

        if ((message.actions || []).length) {
          const actions = document.createElement('div');
          actions.className = 'chat-card-actions';

          (message.actions || []).forEach((action) => {
            if (action.type === 'url') {
              const link = document.createElement('a');
              link.className = 'chat-card-action';
              link.href = action.value;
              link.target = '_blank';
              link.rel = 'noreferrer';
              link.textContent = action.title;
              actions.appendChild(link);
            } else {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'chat-card-action';
              button.textContent = action.title;
              button.addEventListener('click', (e) => {
                // Disable this specific button to prevent double-clicks
                button.disabled = true;
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
                sendMessage(action.value, action.title);
              });
              actions.appendChild(button);
            }
          });

          card.appendChild(actions);
        }

        bubble.appendChild(card);
      }

      async function sendMessage(rawValue, visibleText) {
        const text = String(rawValue || '').trim();
        if (!text) return;

        appendBubble(visibleText || text, 'user');
        messageInput.value = '';
        sendButton.disabled = true;
        statusLabel.textContent = 'Sending';

        try {
          const response = await fetch('/webchat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId, message: text }),
          });

          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || 'Request failed');
          }

          for (const message of payload.messages || []) {
            if (message.type === 'choice') {
              appendChoiceBubble(message);
            } else if (message.type === 'card') {
              appendCardBubble(message);
            } else if (message.type === 'image') {
              appendImageBubble(message.imageUrl);
            } else if (message.type === 'text') {
              appendBubble(message.text, 'bot');
            }
          }

          statusLabel.textContent = 'Ready';
        } catch (error) {
          appendBubble('Sorry, something went wrong. Please try again.', 'bot');
          statusLabel.textContent = 'Error';
        } finally {
          sendButton.disabled = false;
          messageInput.focus();
        }
      }

      sendButton.addEventListener('click', () => sendMessage(messageInput.value));
      messageInput.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey) {
          event.preventDefault();
          sendMessage(messageInput.value);
        }
      });

      appendBubble('Chat ready. Send "hi" to start a live bot conversation.', 'bot');
    </script>
  </body>
</html>`
}
