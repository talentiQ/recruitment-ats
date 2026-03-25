// background.js — service worker
// Handles attachment fetching on behalf of content script (bypasses CORS)

chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('mail.google.com')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TIQ_TOGGLE_SIDEBAR' })
      .catch(() => {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      })
  }
})

// ── Handle attachment download requests from content script ──────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIQ_DOWNLOAD_ATTACHMENT') {
    downloadAttachment(message.downloadUrl, message.filename)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true // Keep message channel open for async response
  }
})

async function downloadAttachment(downloadUrl, filename) {
  if (!downloadUrl) {
    return { base64: '', mimeType: '' }
  }

  const response = await fetch(downloadUrl, {
    credentials: 'include',
    headers: {
      'Accept': '*/*',
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  // Chunk-based base64 encoding to avoid stack overflow on large files
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return {
    base64: btoa(binary),
    mimeType: blob.type || guessMimeType(filename)
  }
}

function guessMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return map[ext] || 'application/octet-stream'
}