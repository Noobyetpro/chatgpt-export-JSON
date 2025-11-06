const $ = (s) => document.querySelector(s);
const previewEl = () => $('#preview');
const filenameEl = () => $('#filename');
const exportBtnEl = () => $('#exportBtn');

function logToPreview(...parts) {
  const p = previewEl();
  const time = new Date().toISOString();
  const msg = parts.map(x => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join(' ');
  if (p) {
    p.value = `[${time}] ${msg}\n\n` + p.value;
  }
  console.log('[popup-debug]', msg);
}

function shortAlert(msg) {

  logToPreview(msg);
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  } catch (err) {
    logToPreview('getActiveTab error:', err && err.message ? err.message : err);
    return null;
  }
}

async function saveJson(filename, jsonStr) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'save', filename, json: jsonStr }, (resp) => {
        if (chrome.runtime.lastError) {
          logToPreview('chrome.runtime.lastError (save):', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          logToPreview('save response:', resp);
          resolve(resp || { success: false, error: 'no response' });
        }
      });
    } catch (e) {
      logToPreview('Exception calling save:', e && e.message ? e.message : e);
      resolve({ success: false, error: e && e.message ? e.message : String(e) });
    }
  });
}

function pageExtractor() {
  function extractConversation() {
    const now = new Date().toISOString();
    let title = (document.title || '').replace(/\s*[\|\-–]\s*ChatGPT/i, '').trim() || null;

    const nodeList = document.querySelectorAll('div[data-message-author-role]');
    const messages = Array.from(nodeList).map((el, idx) => {
      const role = el.getAttribute('data-message-author-role') || 'assistant';
      const text = (el.innerText || '').trim();
      const html = (el.innerHTML || '').trim();
      const id = el.getAttribute('data-message-id') || `msg_${idx}`;
      return { id, role, text, html, timestamp: null };
    });

    return { title, url: location.href, exportedAt: now, messageCount: messages.length, messages };
  }
  return extractConversation();
}

async function doExportFlow() {
  logToPreview('Export started');
  const tab = await getActiveTab();
  if (!tab) {
    shortAlert('No active tab. Focus the ChatGPT tab and open the popup again.');
    return;
  }
  logToPreview('Active tab:', tab.url);

  const okDomains = ['chatgpt.com', 'chat.openai.com'];
  if (!okDomains.some(d => (tab.url || '').includes(d))) {
    shortAlert(`Tab URL doesn't look like ChatGPT. Found: ${tab.url}`);
    shortAlert('Open a ChatGPT conversation at https://chatgpt.com/ or https://chat.openai.com/ then try again.');
    return;
  }

  try {
    logToPreview('Attempting chrome.scripting.executeScript...');
    const execRes = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractor,
    });

    logToPreview('executeScript result:', execRes);

    if (!execRes || !execRes[0] || typeof execRes[0].result === 'undefined') {
      shortAlert('executeScript returned no usable result. Check console for errors or that host_permissions include the page domain.');
      return;
    }

    const conv = execRes[0].result;
    logToPreview('Conversation extracted. messageCount =', conv && conv.messageCount);

    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) {
      shortAlert('Extraction returned 0 messages. Try scrolling the conversation so older messages render, then try again.');
      setPreview(JSON.stringify(conv, null, 2));
      return;
    }

    const json = JSON.stringify(conv, null, 2);
    setPreview(json);

    const filename = (filenameEl() && filenameEl().value) ? filenameEl().value : (`chatgpt-export-${Date.now()}.json`);
    logToPreview('Saving file as', filename);

    const saveResp = await saveJson(filename, json);
    logToPreview('saveJson returned', saveResp);
    if (!saveResp || !saveResp.success) {
      shortAlert('Save failed: ' + (saveResp && saveResp.error ? saveResp.error : 'unknown'));
      return;
    }

    shortAlert('Save successful. Check your downloads. DownloadId: ' + (saveResp.downloadId || 'n/a'));
    setPreview(`Saved: ${filename}\n\n` + json);
  } catch (err) {
    logToPreview('doExportFlow exception:', err && err.message ? err.message : err);
    shortAlert('Export exception: ' + (err && err.message ? err.message : String(err)));
  }
}

function setPreview(text) {
  const p = previewEl();
  if (p) p.value = text;
}

document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = exportBtnEl();
  const copyBtn = $('#copyBtn');
  const filenameInput = filenameEl();

  if (exportBtn) exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const orig = exportBtn.textContent;
    exportBtn.textContent = 'Exporting...';
    try {
      await doExportFlow();
    } finally {
      exportBtn.textContent = orig || 'Export visible chat';
      exportBtn.disabled = false;
    }
  });

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const txt = previewEl() && previewEl().value;
    if (!txt) {
      shortAlert('Nothing to copy. Export first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(txt);
      shortAlert('Copied preview to clipboard.');
    } catch (e) {
      logToPreview('Clipboard error:', e && e.message ? e.message : e);
      shortAlert('Clipboard write failed: ' + (e && e.message ? e.message : String(e)));
    }
  });

  logToPreview('Popup loaded. Ready.');
});