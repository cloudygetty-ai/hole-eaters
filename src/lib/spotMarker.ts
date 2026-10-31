import { SPOT_KINDS, type Spot } from './spots'

export const VENUE = '#4d79ff'      // OpenStreetMap venues
export const COMMUNITY = '#f59e0b'  // member spots

/** DOM element for a MapLibre marker. Built with textContent only: spot names are user text. */
export function spotMarkerEl(s: Spot, onClick: () => void): HTMLElement {
  const color = s.source === 'osm' ? VENUE : COMMUNITY
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', `${SPOT_KINDS[s.kind]?.label ?? 'Spot'}: ${s.name}`)
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;background:none;border:0;padding:0;opacity:${s.status === 'approved' ? 1 : 0.55}`
  const pin = document.createElement('div')
  pin.style.cssText = `position:relative;width:34px;height:34px;border-radius:10px;transform:rotate(45deg);background:rgba(8,9,13,.85);border:2px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px ${color}55`
  const icon = document.createElement('span')
  icon.style.cssText = 'transform:rotate(-45deg);font-size:16px;line-height:1'
  icon.textContent = SPOT_KINDS[s.kind]?.icon ?? '📍'
  pin.appendChild(icon)
  if (s.here_now > 0) {
    const badge = document.createElement('span')
    badge.style.cssText = 'position:absolute;top:-8px;right:-8px;transform:rotate(-45deg);min-width:18px;height:18px;border-radius:9px;background:#22c55e;color:#04150a;font:800 11px/18px system-ui;text-align:center;padding:0 4px'
    badge.textContent = String(s.here_now)
    pin.appendChild(badge)
  }
  const label = document.createElement('div')
  label.style.cssText = `font-size:10px;color:${color};margin-top:6px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;font-family:'DM Mono',monospace;background:rgba(8,9,13,.78);padding:2px 7px;border-radius:5px`
  label.textContent = s.name
  el.appendChild(pin); el.appendChild(label)
  el.addEventListener('click', e => { e.stopPropagation(); onClick() })
  return el
}

