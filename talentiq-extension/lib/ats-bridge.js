// ats-bridge.js
// Runs on recruitment-ats.vercel.app after login.
// Reads the logged-in user from localStorage and writes their ID
// to chrome.storage.local so the Gmail sidebar can authenticate saves.

(function syncUserToStorage() {
  function trySync() {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return

      const user = JSON.parse(raw)
      if (!user?.id) return

      chrome.storage.local.get('supabase_user_id', (result) => {
        // Only write if value changed — avoids unnecessary storage writes
        if (result?.supabase_user_id === user.id) return
        chrome.storage.local.set({ supabase_user_id: user.id }, () => {
          console.log('[TIQ Bridge] Synced user ID to chrome.storage:', user.id)
        })
      })
    } catch (e) {
      // localStorage not accessible or JSON parse failed — silently ignore
    }
  }

  // Run immediately on page load (handles already-logged-in sessions)
  trySync()

  // Also watch for storage changes (handles login completing after page load)
  window.addEventListener('storage', (e) => {
    if (e.key === 'user') trySync()
  })
})()