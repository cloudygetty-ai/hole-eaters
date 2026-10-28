import { createClient } from '@supabase/supabase-js'
import type { ProfileDetails } from './profileDetails'

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabasePublic'
export { SUPABASE_URL, SUPABASE_ANON_KEY }

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } }
})

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Profile {
  id: string
  name: string
  age: number
  role: string
  bio: string
  emoji: string
  color: string
  photo_url: string | null
  video_url: string | null
  is_anon: boolean
  tags: string[]
  cruising_status: string | null
  online: boolean
  last_seen: string
  location?: { lat: number; lng: number } | null
  details?: ProfileDetails
}

export interface Match {
  id: string
  user_a: string
  user_b: string
  created_at: string
  other?: Profile
}

export interface Message {
  id: string
  match_id: string
  sender_id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | 'audio' | null
  read_at: string | null
  created_at: string
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function signInAnon() {
  return supabase.auth.signInAnonymously()
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

// ─── Email auth ──────────────────────────────────────────────────────────────
export async function signUpEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signInEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

// Link anonymous session to email (preserves profile)
export async function upgradeAnon(email: string, password: string) {
  return supabase.auth.updateUser({ email, password })
}

// ─── Profile views ────────────────────────────────────────────────────────────
export async function logProfileView(viewerId: string, viewedId: string) {
  if (viewerId === viewedId) return
  // Plain insert: only needs the INSERT policy. A repeat view returns 409 (already logged), which is fine.
  const res = await supabase.from('profile_views').insert({ viewer_id: viewerId, viewed_id: viewedId, viewed_at: new Date().toISOString() })
  if (res.error && res.error.code !== '23505') console.error('[views] log failed', res.error)
  return res
}

export async function getProfileViews(userId: string) {
  return supabase
    .from('profile_views')
    .select('viewer_id, viewed_at, viewer:profiles!profile_views_viewer_id_fkey(id,name,emoji,color,photo_url,role,online)')
    .eq('viewed_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(50)
}

// ─── Profile helpers ──────────────────────────────────────────────────────────
export async function upsertProfile(profile: Partial<Profile> & { id: string }) {
  return supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single()
}

export async function updateLocation(id: string, lat: number, lng: number) {
  return supabase.rpc('update_user_location', { user_id: id, lat, lng })
    .then(() => supabase.from('profiles')
      .update({ online: true, last_seen: new Date().toISOString() })
      .eq('id', id))
}

export async function setOnline(id: string, online: boolean) {
  return supabase.from('profiles').update({ online, last_seen: new Date().toISOString() }).eq('id', id)
}

// ─── Nearby users ─────────────────────────────────────────────────────────────
export async function getNearbyUsers(lat: number, lng: number, radius = 5000) {
  return supabase.rpc('nearby_users', { lat, lng, radius_meters: radius })
}

// ─── Likes + Matches ─────────────────────────────────────────────────────────
export async function likeUser(fromId: string, toId: string) {
  return supabase.from('likes').insert({ from_user: fromId, to_user: toId })
}

// Likes other people sent you, newest first, with the sender's profile
export async function getLikesReceived(userId: string) {
  return supabase
    .from('likes')
    .select('from_user, created_at, from_profile:profiles!likes_from_user_fkey(*)')
    .eq('to_user', userId)
    .order('created_at', { ascending: false })
    .limit(100)
}

// A conversation is a matches row; matches.user_a < user_b is enforced by a check constraint.
// Opening a chat with anyone finds or creates that row, so messaging doesn't require a mutual like.
export async function startConversation(myId: string, otherId: string) {
  const [user_a, user_b] = myId < otherId ? [myId, otherId] : [otherId, myId]
  const existing = await supabase.from('matches').select('*').eq('user_a', user_a).eq('user_b', user_b).maybeSingle()
  if (existing.data) return { data: existing.data as Match, error: null }
  const created = await supabase.from('matches').insert({ user_a, user_b }).select().single()
  if (created.error?.code === '23505') {
    // Created concurrently (e.g. the mutual-like trigger); read it back
    return supabase.from('matches').select('*').eq('user_a', user_a).eq('user_b', user_b).single()
  }
  return created
}

export async function isMutualMatch(myId: string, otherId: string) {
  const [user_a, user_b] = myId < otherId ? [myId, otherId] : [otherId, myId]
  const { data: theyLikedMe } = await supabase.from('likes').select('from_user').eq('from_user', otherId).eq('to_user', myId).maybeSingle()
  if (!theyLikedMe) return false
  const { data } = await supabase.from('matches').select('id').eq('user_a', user_a).eq('user_b', user_b).maybeSingle()
  return !!data
}

export async function getMatches(userId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*, user_a_profile:profiles!matches_user_a_fkey(id,name,emoji,color,photo_url,online), user_b_profile:profiles!matches_user_b_fkey(id,name,emoji,color,photo_url,online)')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false })
  return { data, error }
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export async function getMessages(matchId: string) {
  return supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true })
}

export async function sendMessage(matchId: string, senderId: string, content: string, mediaUrl?: string, mediaType?: Message['media_type']) {
  return supabase.from('messages').insert({ match_id: matchId, sender_id: senderId, content, media_url: mediaUrl || null, media_type: mediaType || null }).select().single()
}

export function subscribeToMessages(matchId: string, cb: (msg: Message) => void) {
  return supabase.channel(`messages:${matchId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (payload) => cb(payload.new as Message))
    .subscribe()
}

export function subscribeToPresence(cb: (profiles: Profile[]) => void) {
  return supabase.channel('online_users')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async () => {
      const { data } = await supabase.from('profiles').select('*').eq('online', true)
      if (data) cb(data as Profile[])
    })
    .subscribe()
}

// ─── Media upload ─────────────────────────────────────────────────────────────
export async function uploadMedia(file: File, path: string) {
  const { data, error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
  if (error) return { url: null, error }
  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.path)
  return { url: publicUrl, error: null }
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export type ReportReason = 'fake_profile'|'harassment'|'underage'|'spam'|'inappropriate_photo'|'other'
export type ReportStatus = 'pending'|'reviewed'|'actioned'|'dismissed'

export interface Report {
  id: string
  reporter_id: string
  reported_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  actioned_by: string | null
  actioned_at: string | null
  action_taken: string | null
  created_at: string
}

export interface Ban {
  id: string
  user_id: string
  reason: string | null
  banned_by: string | null
  expires_at: string | null
  created_at: string
}

export interface AdminLog {
  id: string
  admin_id: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export async function submitReport(reporterId: string, reportedId: string, reason: ReportReason, details?: string) {
  return supabase.from('reports').insert({ reporter_id: reporterId, reported_id: reportedId, reason, details: details || null })
}

export async function getReports(status?: ReportStatus) {
  let q = supabase.from('reports').select(`
    *,
    reporter:profiles!reports_reporter_id_fkey(id,name,emoji,color),
    reported:profiles!reports_reported_id_fkey(id,name,emoji,color,photo_url,bio,role,age,tags)
  `).order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  return q
}

export async function updateReportStatus(reportId: string, status: ReportStatus, adminId: string, action?: string) {
  return supabase.from('reports').update({
    status, actioned_by: adminId, actioned_at: new Date().toISOString(), action_taken: action || null
  }).eq('id', reportId)
}

export async function banUser(userId: string, adminId: string, reason: string, expiresAt?: string) {
  const { error } = await supabase.from('bans').upsert({ user_id: userId, banned_by: adminId, reason, expires_at: expiresAt || null }, { onConflict: 'user_id' })
  if (!error) {
    await supabase.from('profiles').update({ online: false }).eq('id', userId)
    await logAdminAction(adminId, 'ban_user', 'profile', userId, { reason, expires_at: expiresAt })
  }
  return { error }
}

export async function unbanUser(userId: string, adminId: string) {
  const { error } = await supabase.from('bans').delete().eq('user_id', userId)
  if (!error) await logAdminAction(adminId, 'unban_user', 'profile', userId, {})
  return { error }
}

export async function deleteProfile(userId: string, adminId: string) {
  await logAdminAction(adminId, 'delete_profile', 'profile', userId, {})
  return supabase.from('profiles').delete().eq('id', userId)
}

export async function logAdminAction(adminId: string, action: string, targetType: string, targetId: string, metadata: Record<string, any>) {
  return supabase.from('admin_log').insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata })
}

export async function getAdminStats() {
  return supabase.rpc('get_admin_stats').single()
}

export async function getAdminLog() {
  return supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(100)
}

export async function getAllProfiles() {
  return supabase.from('profiles').select('*').order('created_at', { ascending: false })
}

export async function getBans() {
  return supabase.from('bans').select(`*, profile:profiles(id,name,emoji,color)`).order('created_at', { ascending: false })
}

export async function checkIsAdmin() {
  return supabase.rpc('is_admin')
}

// ─── Read receipts ───────────────────────────────────────────────────────────
export async function markMessagesRead(matchId: string, userId: string) {
  return supabase.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .neq('sender_id', userId)
    .is('read_at', null)
}

export async function getUnreadCounts(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('messages')
    .select('match_id')
    .neq('sender_id', userId)
    .is('read_at', null)
    .in('match_id',
      (await supabase.from('matches')
        .select('id')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      ).data?.map((m: any) => m.id) ?? []
    )
  const counts: Record<string, number> = {}
  data?.forEach((m: any) => { counts[m.match_id] = (counts[m.match_id] ?? 0) + 1 })
  return counts
}

// ─── Password reset ───────────────────────────────────────────────────────────
export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
}

// ─── Reviews + Flake Scale ────────────────────────────────────────────────────
// Reviewer identity never leaves the database: others read through get_reviews / get_review_summary.
export type MeetOutcome = 'showed' | 'late' | 'flaked' | 'chat_only'

export interface Review {
  id: string
  met: MeetOutcome
  rating: number | null
  tags: string[]
  body: string | null
  created_at: string
  is_mine: boolean
}

export interface ReviewSummary {
  review_count: number
  avg_rating: number | null
  meetups: number
  showed: number
  late: number
  flaked: number
  flake_rate: number | null
  can_review: boolean
}

export interface ReviewInput { met: MeetOutcome; rating: number | null; tags: string[]; body: string | null }

export async function getReviews(target: string): Promise<{ data: Review[]; error: any }> {
  const { data, error } = await supabase.rpc('get_reviews', { target })
  return { data: (data as Review[] | null) ?? [], error }
}

export async function getReviewSummary(target: string): Promise<{ data: ReviewSummary | null; error: any }> {
  const { data, error } = await supabase.rpc('get_review_summary', { target }).single()
  return { data: data as ReviewSummary | null, error }
}

export async function getMyReviewFor(reviewer: string, target: string) {
  return supabase.from('reviews').select('met,rating,tags,body').eq('reviewer_id', reviewer).eq('reviewee_id', target).maybeSingle()
}

export async function saveReview(reviewer: string, target: string, input: ReviewInput) {
  return supabase.from('reviews').upsert({ reviewer_id: reviewer, reviewee_id: target, ...input }, { onConflict: 'reviewer_id,reviewee_id' })
}

export async function deleteMyReview(reviewer: string, target: string) {
  return supabase.from('reviews').delete().eq('reviewer_id', reviewer).eq('reviewee_id', target)
}

export async function flagReview(reviewId: string) {
  return supabase.rpc('flag_review', { review: reviewId })
}

// Admin only (checked in the database): flagged reviews with who wrote them, and hide/keep
export interface FlaggedReview extends Omit<Review, 'is_mine'> { reviewer_id: string; reviewer_name: string | null; reviewee_id: string; reviewee_name: string | null }

export async function getFlaggedReviews(): Promise<{ data: FlaggedReview[]; error: any }> {
  const { data, error } = await supabase.rpc('admin_flagged_reviews')
  return { data: (data as FlaggedReview[] | null) ?? [], error }
}

export async function moderateReview(reviewId: string, hide: boolean) {
  return supabase.rpc('admin_moderate_review', { review: reviewId, hide })
}

// ─── Global Chat ──────────────────────────────────────────────────────────────
export interface GlobalMessage {
  id: string
  sender_id: string | null
  content: string
  media_url: string | null
  media_type: 'image' | 'video' | null
  created_at: string
  sender?: Pick<Profile, 'id' | 'name' | 'emoji' | 'color' | 'photo_url'>
}

export async function getGlobalMessages(limit = 60) {
  return supabase
    .from('global_messages')
    .select('*, sender:profiles!global_messages_sender_id_fkey(id,name,emoji,color,photo_url)')
    .order('created_at', { ascending: true })
    .limit(limit)
}

export async function sendGlobalMessage(senderId: string, content: string, mediaUrl?: string, mediaType?: 'image' | 'video') {
  return supabase.from('global_messages').insert({
    sender_id: senderId,
    content,
    media_url: mediaUrl || null,
    media_type: mediaType || null,
  }).select('*, sender:profiles!global_messages_sender_id_fkey(id,name,emoji,color,photo_url)').single()
}

export function subscribeToGlobalChat(cb: (msg: GlobalMessage) => void) {
  return supabase.channel('global_chat')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'global_messages'
    }, async (payload) => {
      // Fetch with sender join
      const { data } = await supabase
        .from('global_messages')
        .select('*, sender:profiles!global_messages_sender_id_fkey(id,name,emoji,color,photo_url)')
        .eq('id', payload.new.id)
        .single()
      if (data) cb(data as GlobalMessage)
    })
    .subscribe()
}

// ─── Push subscriptions (one row per device) ─────────────────────────────────
export async function savePushSubscription(userId: string, sub: PushSubscription) {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return { error: new Error('incomplete subscription') }
  return supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: 'endpoint' },
  )
}

export async function deletePushSubscription(endpoint: string) {
  return supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
