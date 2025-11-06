chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
