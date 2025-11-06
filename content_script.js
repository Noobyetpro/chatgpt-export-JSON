function extractConversation() {

  const now = new Date().toISOString();

  let title = null;
  try {

    const h1 = document.querySelector('h1, header h1');
    if (h1 && h1.innerText.trim()) title = h1.innerText.trim();
  } catch (e) {}

  if (!title || title.toLowerCase().includes('chatgpt')) {
    title = (document.title || '').replace(/\s*[-|]\s*ChatGPT/i, '').trim() || null;
  }

  let items = [];
  try {

    const listItems = document.querySelectorAll('div[role="listitem"], div[role="list"] div[role="listitem"]');
    if (listItems && listItems.length) items = Array.from(listItems);
  } catch (e) {}

  if (!items.length) {

    items = Array.from(document.querySelectorAll('article')).filter(a => a.innerText.trim());
  }

  if (!items.length) {
    const mainPane = document.querySelector('main') || document.body;
    items = Array.from(mainPane.querySelectorAll('div')).filter(d => {
      const txt = (d.innerText || '').trim();
      return txt.length > 10 && txt.split('\n').length < 200; 
    });
  }

  items = Array.from(new Set(items)).sort((a, b) => {

    if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return -1;
  });

  const messages = [];
  let inferredRole = 'user'; 

  items.forEach((el, idx) => {
    try {
      const text = el.innerText ? el.innerText.trim() : '';
      if (!text) return; 

      let role = null;

      const ariaLabel = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('role'));
      if (ariaLabel && /assistant|bot|chatgpt/i.test(ariaLabel)) role = 'assistant';
      if (ariaLabel && /user|you/i.test(ariaLabel)) role = 'user';

      if (!role) {
        const img = el.querySelector('img[alt], img');
        if (img && img.alt && /assistant|bot|chatgpt/i.test(img.alt)) role = 'assistant';
        if (img && img.alt && /you|user/i.test(img.alt)) role = 'user';

        const svg = el.querySelector('svg[aria-label]');
        if (!role && svg) {
          const al = svg.getAttribute('aria-label') || '';
          if (/assistant|bot|chatgpt/i.test(al)) role = 'assistant';
          if (/you|user/i.test(al)) role = 'user';
        }
      }

      if (!role) {
        role = (idx % 2 === 0) ? 'user' : 'assistant';
      }

      let ts = null;
      const timeEl = el.querySelector('time') || el.querySelector('span[title], abbr[title]');
      if (timeEl) {
        ts = timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || timeEl.innerText.trim();
      } else {

        const parentTime = el.parentElement && el.parentElement.querySelector && el.parentElement.querySelector('time');
        if (parentTime) ts = parentTime.getAttribute('datetime') || parentTime.innerText.trim();
      }

      let id = el.getAttribute('id') || null;
      if (!id) {

        const shortHash = (text.length + Array.from(text).slice(0,10).reduce((s,c)=>s+c.charCodeAt(0),0)).toString(36);
        id = `${role}_${idx}_${shortHash}`;
      }

      messages.push({
        id,
        role,
        text,
        html: el.innerHTML,
        timestamp: ts || null
      });
    } catch (e) {

    }
  });

  return {
    title,
    url: location.href,
    exportedAt: now,
    messageCount: messages.length,
    messages
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'extract') {
    try {
      const conv = extractConversation();
      sendResponse({ success: true, data: conv });
    } catch (err) {
      sendResponse({ success: false, error: err.message || String(err) });
    }

    return true;
  }
});chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || msg.action !== 'save') {
        sendResponse({ success: false, error: 'invalid_action' });
        return;
      }

      const filename = typeof msg.filename === 'string' && msg.filename.trim() ? msg.filename.trim() : `chatgpt-export-${Date.now()}.json`;
      const jsonStr = typeof msg.json === 'string' ? msg.json : JSON.stringify(msg.json || {}, null, 2);

      const approxBytes = new TextEncoder().encode(jsonStr).length;
      const SAFE_LIMIT_BYTES = 5 * 1024 * 1024; 

      if (approxBytes > SAFE_LIMIT_BYTES) {

        console.warn(`Attempting to download large JSON (~${Math.round(approxBytes/1024)} KB).`);
      }

      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

      chrome.downloads.download({
        url: dataUrl,
        filename,
        conflictAction: 'uniquify',
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('download error', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message || 'download_failed' });
        } else {
          sendResponse({ success: true, downloadId });
        }
      });

      return true;
    } catch (err) {
      console.error('background save error', err);
      sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
    }
  })();

  return true;
});