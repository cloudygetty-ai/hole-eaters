// Pulse Rooms: 60-minute chat rooms every signed-in session can see and join.
// Rooms and messages live in Supabase (pulse_rooms, pulse_room_messages); the database fills in the
// sender, display fields and expiry. See supabase/migrations/20261111110000_shared_pulse_rooms.sql.
// Realtime pushes changes; polling is the fallback, so rooms still show up if the socket is down.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

export interface PulseMsg { id: string; senderId: string; senderName: string; senderEmoji: string; senderColor: string; content: string; ts: number }
export interface PulseRoom { id: string; name: string; creatorId: string; creatorName: string; memberIds: string[]; messages: PulseMsg[]; expiresAt: number; pulseColor: string }

export const PULSE_TTL = 60 * 60 * 1000
const ROOMS_POLL_MS = 15_000
const MESSAGES_POLL_MS = 5_000

interface RoomRow { id: string; name: string; color: string; creator_id: string; creator_name: string; member_ids: string[] | null; expires_at: string }
interface MsgRow { id: string; sender_id: string; sender_name: string; sender_emoji: string; sender_color: string; content: string; created_at: string }

const toRoom = (r: RoomRow): PulseRoom => ({
  id: r.id, name: r.name, creatorId: r.creator_id, creatorName: r.creator_name,
  memberIds: r.member_ids ?? [], messages: [], expiresAt: new Date(r.expires_at).getTime(), pulseColor: r.color,
})
const toMsg = (m: MsgRow): PulseMsg => ({
  id: m.id, senderId: m.sender_id, senderName: m.sender_name, senderEmoji: m.sender_emoji,
  senderColor: m.sender_color, content: m.content, ts: new Date(m.created_at).getTime(),
})
const isLive = (r: PulseRoom) => Date.now() < r.expiresAt

async function fetchRooms(): Promise<PulseRoom[] | null> {
  const { data, error } = await supabase.from('pulse_rooms').select('*').order('created_at')
  if (error) { console.warn('[pulse] rooms', error.message); return null }
  return (data as RoomRow[]).map(toRoom).filter(isLive)
}

async function fetchMessages(roomId: string): Promise<PulseMsg[] | null> {
  const { data, error } = await supabase.from('pulse_room_messages').select('*').eq('room_id', roomId).order('created_at').limit(200)
  if (error) { console.warn('[pulse] messages', error.message); return null }
  return (data as MsgRow[]).map(toMsg)
}

type Me = { name?: string | null; emoji?: string | null; color?: string | null } | null

/** Live rooms, the open room with its messages, and the actions on them. `onError` gets user-facing text. */
export function usePulseRooms(userId: string | null, me: Me, onError: (msg: string) => void) {
  const [rooms, setRooms] = useState<PulseRoom[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<PulseMsg[]>([])

  const refreshRooms = useCallback(async () => {
    const next = await fetchRooms()
    if (next) setRooms(next) // keep the last good list on a failed fetch
  }, [])

  useEffect(() => {
    if (!userId) { setRooms([]); return }
    void refreshRooms()
    const poll = setInterval(() => void refreshRooms(), ROOMS_POLL_MS)
    const channel = supabase.channel('pulse_rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pulse_rooms' }, () => void refreshRooms())
      .subscribe()
    return () => { clearInterval(poll); void supabase.removeChannel(channel) }
  }, [userId, refreshRooms])

  const refreshMessages = useCallback(async (roomId: string) => {
    const next = await fetchMessages(roomId)
    if (next) setMessages(next)
  }, [])

  useEffect(() => {
    setMessages([])
    if (!activeId) return
    void refreshMessages(activeId)
    const poll = setInterval(() => void refreshMessages(activeId), MESSAGES_POLL_MS)
    const channel = supabase.channel(`pulse_room_messages:${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pulse_room_messages', filter: `room_id=eq.${activeId}` }, () => void refreshMessages(activeId))
      .subscribe()
    return () => { clearInterval(poll); void supabase.removeChannel(channel) }
  }, [activeId, refreshMessages])

  const active = useMemo(() => {
    const room = rooms.find(r => r.id === activeId)
    return room && isLive(room) ? { ...room, messages } : null
  }, [rooms, activeId, messages])

  const open = useCallback((id: string) => {
    setActiveId(id)
    void supabase.rpc('join_pulse_room', { p_room: id }).then(({ error }) => {
      if (error) console.warn('[pulse] join', error.message)
      void refreshRooms()
    })
  }, [refreshRooms])

  const close = useCallback(() => setActiveId(null), [])

  /** Resolves true once the room exists and is open. */
  const create = useCallback(async (name: string, color: string): Promise<boolean> => {
    if (!userId) return false
    // The database overwrites creator, members and expiry; they are sent so the row is complete either way.
    const { data, error } = await supabase.from('pulse_rooms')
      .insert({ name: name.trim(), color, creator_id: userId, creator_name: me?.name ?? '', member_ids: [userId], expires_at: new Date(Date.now() + PULSE_TTL).toISOString() })
      .select('*').single()
    if (error || !data) { onError(error?.message?.startsWith('Slow down') ? error.message : "Couldn't start the room. Try again."); return false }
    const room = toRoom(data as RoomRow)
    setRooms(prev => [...prev.filter(r => r.id !== room.id), room])
    setActiveId(room.id)
    return true
  }, [userId, me?.name, onError])

  const send = useCallback(async (text: string) => {
    const content = text.trim()
    if (!content || !activeId || !userId) return
    const { error } = await supabase.from('pulse_room_messages')
      .insert({ room_id: activeId, sender_id: userId, sender_name: me?.name ?? '', sender_emoji: me?.emoji ?? '🔥', sender_color: me?.color ?? '#ff4d6d', content })
    if (error) { onError(error.message.startsWith('Slow down') ? error.message : "Message didn't send."); return }
    void refreshMessages(activeId)
  }, [activeId, userId, me?.name, me?.emoji, me?.color, onError, refreshMessages])

  return { rooms, active, open, close, create, send }
}
