// Small live counts read as "dead app" and churn new users. Below the floor, show a qualitative label.
const PRESENCE_FLOOR = 3

export function presenceLabel(count: number, unit = 'online'): string {
  return count >= PRESENCE_FLOOR ? `${count} ${unit}` : `Active ${unit === 'LIVE' ? 'NOW' : 'nearby'}`
}
