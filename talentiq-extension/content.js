// content.js — runs on mail.google.com

if (!window.__tiqLoaded) {
  window.__tiqLoaded = true

  const CV_EXTS = ['pdf', 'doc', 'docx']
  let sidebarFrame = null
  let debounceTimer = null

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
      chrome.runtime.sendMessage(
        { type: 'TIQ_DOWNLOAD_ATTACHMENT', downloadUrl, filename },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[TIQ]', chrome.runtime.lastError.message)
          }
          sidebarFrame?.contentWindow?.postMessage({
            type: 'TIQ_ATTACHMENT_DATA',
            filename,
            base64: response?.base64 || '',
            mimeType: response?.mimeType || ''
          }, '*')
        }
      )
    }
  }

  // ── Check if a filename is a CV type ────────────────────────────────────────
  function isCVFile(filename) {
    if (!filename) return false
    const ext = filename.trim().split('.').pop().toLowerCase()
    return CV_EXTS.includes(ext)
  }

  // ── Extract filename from an attachment element ──────────────────────────────
  function extractFilename(el) {
    // 1. aria-label on element or children
    const ariaLabel = el.getAttribute('aria-label')
      || el.querySelector('[aria-label]')?.getAttribute('aria-label')
    if (ariaLabel) {
      const cleaned = ariaLabel.replace(/^(download|open|save)\s+/i, '').trim()
      if (cleaned.includes('.')) return cleaned
    }

    // 2. attfn param in download-url
    const downloadUrl = el.getAttribute('download-url') || ''
    const attfn = downloadUrl.split('&').find(p => p.toLowerCase().startsWith('attfn='))
    if (attfn) return decodeURIComponent(attfn.split('=')[1])

    // 3. Text content of element
    const text = el.textContent?.trim()
    if (text && text.includes('.')) return text

    // 4. data-tooltip
    const tooltip = el.getAttribute('data-tooltip')
    if (tooltip && tooltip.includes('.')) return tooltip.replace(/^(download|open|save)\s+/i, '').trim()

    return ''
  }

  // ── Extract download URL ─────────────────────────────────────────────────────
  function extractDownloadUrl(el) {
    // 1. Direct attribute on element
    const direct = el.getAttribute('download-url')
    if (direct) return direct

    // 2. Search within the attachment card container
    const card = el.closest('[data-legacy-attachment-id]')
      || el.closest('[data-attachment-id]')
      || el.closest('.aQH')
      || el.closest('.aZo')
      || el.parentElement

    if (card) {
      // Find any child with download-url
      const child = card.querySelector('[download-url]')
      if (child) return child.getAttribute('download-url')

      // Find download anchor
      const anchor = card.querySelector('a[href*="mail.google.com"]')
        || card.querySelector('a[href*="attachment"]')
      if (anchor?.href) return anchor.href

      // Build from attachment ID
      const attId = card.getAttribute('data-legacy-attachment-id')
        || card.getAttribute('data-attachment-id')
      const msgMatch = location.href.match(/([A-Za-z0-9]{16,})/)
      const msgId = msgMatch?.[1]
      if (attId && msgId) {
        return `https://mail.google.com/mail/u/0/?ui=2&ik=&attid=${attId}&disp=attd&realattid=${attId}&msgid=${msgId}&zw`
      }
    }

    return null
  }

  // ── Find attachment cards in Gmail ───────────────────────────────────────────
  // Gmail renders each attachment as a card/chip — we target those containers
  function findAttachmentCards() {
    const cards = []

    // Primary: Gmail attachment cards with data-legacy-attachment-id
    document.querySelectorAll('[data-legacy-attachment-id]').forEach(card => {
      if (!card.dataset.tiqScanned) cards.push(card)
    })

    // Fallback: attachment chip containers
    if (cards.length === 0) {
      document.querySelectorAll('.aQH, .aZo').forEach(card => {
        if (!card.dataset.tiqScanned) cards.push(card)
      })
    }

    // Fallback: elements with download-url (each is one attachment)
    if (cards.length === 0) {
      document.querySelectorAll('[download-url]').forEach(el => {
        if (!el.dataset.tiqScanned) cards.push(el)
      })
    }

    return cards
  }

  // ── Inject one button per CV attachment card ─────────────────────────────────
  function injectButtons() {
    const cards = findAttachmentCards()
    if (!cards.length) return

    cards.forEach(card => {
      card.dataset.tiqScanned = '1'

      // Get filename for this specific card
      const filename = extractFilename(card)

      // Skip non-CV files (Excel, images, ZIP etc.)
      if (!isCVFile(filename)) return

      // Skip if button already injected on this card
      if (card.querySelector('[data-tiq-btn]')) return

      const downloadUrl = extractDownloadUrl(card)

      const btn = document.createElement('button')
      btn.className = 'tiq-btn'
      btn.setAttribute('data-tiq-btn', '1')
      btn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        Add to Talent IQ
      `

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        openSidebar()
        setTimeout(() => {
          sidebarFrame?.contentWindow?.postMessage({
            type: 'TIQ_LOAD_ATTACHMENT',
            filename,
            downloadUrl: downloadUrl || ''
          }, '*')
        }, 350)
      })

      // Append inside the card so button stays with its attachment
      card.style.position = 'relative'
      card.appendChild(btn)
    })
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    injectSidebar()
    setTimeout(injectButtons, 2000)

    // Watch URL changes for Gmail SPA navigation
    let lastUrl = location.href
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        // Reset on navigation so new email gets fresh buttons
        document.querySelectorAll('.tiq-btn').forEach(b => b.remove())
        document.querySelectorAll('[data-tiq-scanned]').forEach(el => {
          delete el.dataset.tiqScanned
        })
        debounce(injectButtons, 1500)
      }
    }).observe(document.querySelector('title') || document.documentElement, {
      childList: true, subtree: false
    })

    // Watch email body for attachment cards appearing
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