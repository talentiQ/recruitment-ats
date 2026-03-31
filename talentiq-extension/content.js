// content.js — runs on mail.google.com

if (!window.__tiqLoaded) {
  window.__tiqLoaded = true

  const CV_EXTS = ['pdf', 'doc', 'docx']
  let sidebarFrame = null
  let debounceTimer = null

  // ✅ ADDED: Extension detection listener (ATS → Extension communication)
  window.addEventListener("message", (event) => {
    if (event.data?.type === "CHECK_TIQ_EXTENSION") {
      window.postMessage({ type: "TIQ_EXTENSION_INSTALLED" }, "*");
    }
  });

  // Returns false when the extension has been reloaded and this content script
  // is now orphaned — chrome.runtime calls will throw if we don't check first.
  function isExtensionContextValid() {
    try {
      return !!chrome.runtime?.id
    } catch {
      return false
    }
  }

  function debounce(fn, delay) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(fn, delay)
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('tiq-sidebar')) return
    const frame = document.createElement('iframe')
    frame.id = 'tiq-sidebar'
    frame.src = chrome.runtime.getURL('sidebar.html')
    frame.style.cssText = `
      position:fixed;top:0;right:0;width:380px;height:100vh;
      border:none;z-index:99999;
      box-shadow:-4px 0 24px rgba(0,0,0,0.18);
      transform:translateX(100%);
      transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);
      border-radius:12px 0 0 12px;
    `
    document.body.appendChild(frame)
    sidebarFrame = frame
    window.addEventListener('message', handleSidebarMessage)
  }

  function openSidebar() {
    if (!sidebarFrame) injectSidebar()
    setTimeout(() => { sidebarFrame.style.transform = 'translateX(0)' }, 50)
  }

  function closeSidebar() {
    if (sidebarFrame) sidebarFrame.style.transform = 'translateX(100%)'
  }

  // ── Message handler ──────────────────────────────────────────────────────────
  function handleSidebarMessage(event) {
    if (!event.data?.type) return
    if (event.data.type === 'TIQ_CLOSE') closeSidebar()
    if (event.data.type === 'TIQ_FETCH_ATTACHMENT') {
      const { downloadUrl, filename } = event.data
      if (!downloadUrl) {
        sidebarFrame?.contentWindow?.postMessage({
          type: 'TIQ_ATTACHMENT_DATA', filename, base64: '', mimeType: ''
        }, '*')
        return
      }
      if (!isExtensionContextValid()) {
        console.warn('[TIQ] Extension context invalidated — please refresh the Gmail tab.')
        sidebarFrame?.contentWindow?.postMessage({
          type: 'TIQ_ATTACHMENT_DATA', filename, base64: '', mimeType: ''
        }, '*')
        return
      }
      try {
        chrome.runtime.sendMessage(
          { type: 'TIQ_DOWNLOAD_ATTACHMENT', downloadUrl, filename },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[TIQ] sendMessage error:', chrome.runtime.lastError.message)
              sidebarFrame?.contentWindow?.postMessage({
                type: 'TIQ_ATTACHMENT_DATA', filename, base64: '', mimeType: ''
              }, '*')
              return
            }
            sidebarFrame?.contentWindow?.postMessage({
              type: 'TIQ_ATTACHMENT_DATA',
              filename,
              base64: response?.base64 || '',
              mimeType: response?.mimeType || ''
            }, '*')
          }
        )
      } catch (err) {
        console.warn('[TIQ] sendMessage threw — context likely invalidated:', err.message)
        sidebarFrame?.contentWindow?.postMessage({
          type: 'TIQ_ATTACHMENT_DATA', filename, base64: '', mimeType: ''
        }, '*')
      }
    }
  }

   function init() {
    injectSidebar()
    setTimeout(injectButtons, 2000)

    let lastUrl = location.href
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        document.querySelectorAll('.tiq-btn').forEach(b => b.remove())
        document.querySelectorAll('[data-tiq-scanned]').forEach(el => {
          delete el.dataset.tiqScanned
        })
        debounce(injectButtons, 1500)
      }
    }).observe(document.querySelector('title') || document.documentElement, {
      childList: true, subtree: false
    })

    const target = document.querySelector('[role="main"]') || document.body
    new MutationObserver((mutations) => {
      const relevant = mutations.some(m =>
        [...m.addedNodes].some(n =>
          n.nodeType === 1 && (
            n.querySelector?.('[data-legacy-attachment-id]') ||
            n.querySelector?.('[download-url]') ||
            n.hasAttribute?.('data-legacy-attachment-id') ||
            n.hasAttribute?.('download-url')
          )
        )
      )
      if (relevant) debounce(injectButtons, 800)
    }).observe(target, {
      childList: true, subtree: true,
      attributes: false, characterData: false
    })
  }

  init()

} // end __tiqLoaded guard