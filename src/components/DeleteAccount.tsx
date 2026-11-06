import { useState } from 'react'
import { deleteMyAccount } from '../lib/supabase'
import type { PrivacyTheme } from './PrivacySettings'

// Typed confirmation, because this can't be undone: there is no grace period or backup copy.
export function DeleteAccountSheet({ theme: t, onDeleted, onCancel }: { theme: PrivacyTheme; onDeleted: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ready = typed.trim().toUpperCase() === 'DELETE' && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true); setErr('')
    const res = await deleteMyAccount()
    if (res.ok) { onDeleted(); return }
    setBusy(false)
    setErr(res.error === 'admin_account' ? 'Admin accounts have to be removed by hand.' : "Couldn't delete your account. Check your connection and try again.")
  }

  return (
    <div role="dialog" aria-label="Delete account" style={{ position: 'fixed', inset: 0, zIndex: 890, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'flex-end' }} onClick={busy ? undefined : onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: t.surface, borderRadius: '22px 22px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom))' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 8 }}>Delete your account?</div>
        <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.55, marginBottom: 14 }}>
          This permanently erases your profile, photos, videos, chats, likes, reviews, location and settings. It can't be undone and we keep no copy.
        </div>
        <label htmlFor="del-confirm" style={{ fontSize: 12, color: t.dim }}>Type DELETE to confirm</label>
        <input id="del-confirm" autoComplete="off" autoCapitalize="characters" value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, fontSize: 16, padding: 12, borderRadius: 12, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text }} />
        <div role="status" style={{ color: '#ef4444', fontSize: 12, minHeight: 18, marginTop: 6 }}>{err}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: 14, borderRadius: 12, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text, fontWeight: 700 }}>Cancel</button>
          <button onClick={submit} disabled={!ready} style={{ flex: 1, padding: 14, borderRadius: 12, background: ready ? '#ef4444' : t.surf3, color: ready ? '#fff' : t.dim, fontWeight: 800, border: 'none' }}>
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  )
}
