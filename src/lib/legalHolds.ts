// Client for the admin-only legal-hold edge function. Members never call this.
import { supabase } from './supabase'

export type HoldReason = 'legal_process' | 'litigation' | 'ncmec_report'
export const HOLD_REASONS: { id: HoldReason; label: string }[] = [
  { id: 'legal_process', label: 'Subpoena / warrant / court order' },
  { id: 'litigation', label: 'Litigation hold' },
  { id: 'ncmec_report', label: 'NCMEC report (CSAM)' },
]

export interface LegalHold {
  user_id: string; reason: HoldReason; reference: string | null; note: string | null
  placed_at: string; closed_at: string | null; evidence_rows: number
  profile: { id: string; name: string | null; emoji: string | null; color: string | null } | null
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('legal-hold', { body })
  if (error) throw error
  return data as T
}

export const listHolds = () => call<{ holds: LegalHold[] }>({ action: 'list' }).then(r => r.holds)
export const placeHold = (user_id: string, reason: HoldReason, reference?: string, note?: string) =>
  call<{ ok: true; files: number }>({ action: 'place', user_id, reason, reference, note })
export const releaseHold = (user_id: string) => call<{ ok: true; deleted: boolean }>({ action: 'release', user_id })

/** Prompt-driven so it can hang off any admin row (users, reports) without a modal. */
export async function promptPlaceHold(userId: string, name: string): Promise<boolean> {
  const pick = window.prompt(`Legal hold on ${name}. Reason:\n${HOLD_REASONS.map((r, i) => `${i + 1}. ${r.label}`).join('\n')}`, '1')
  const reason = HOLD_REASONS[Number(pick) - 1]?.id
  if (!reason) return false
  const reference = window.prompt('Reference (case, subpoena or CyberTipline report #). Optional.') ?? undefined
  try {
    const { files } = await placeHold(userId, reason, reference || undefined)
    window.alert(`Hold placed. ${files} file(s) preserved. Their account can no longer be erased.`)
    return true
  } catch (e) {
    window.alert(`Hold failed: ${e instanceof Error ? e.message : e}. Run it again; it resumes where it stopped.`)
    return false
  }
}
