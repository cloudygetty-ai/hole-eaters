// Sticker pack served from /public/stickers. Used for chat stickers and profile "taps".
export interface Sticker { id: string; label: string }

export const STICKERS: Sticker[] = [
  { id: 'peach', label: 'Peach' }, { id: 'big-peach', label: 'Big peach' }, { id: 'peach-cheeks', label: 'Peach cheeks' }, { id: 'peach-2', label: 'Ripe' },
  { id: 'golden-cheeks', label: 'Golden' }, { id: 'honey-buns', label: 'Honey buns' }, { id: 'serrano', label: 'Serrano' }, { id: 'twerk-pose', label: 'Twerk pose' },
  { id: 'serrano-2', label: 'Serrano 2' }, { id: 'serrano-3', label: 'Serrano 3' }, { id: 'heart', label: 'Heart' }, { id: 'b-cheeks', label: 'B' },
  { id: 'pucker-pink', label: 'Pucker pink' }, { id: 'pucker-purple', label: 'Pucker purple' }, { id: 'pucker-orange', label: 'Pucker orange' }, { id: 'keyhole', label: 'Keyhole' },
  { id: 'donut', label: 'Donut' }, { id: 'bagel', label: 'Bagel' }, { id: 'bao', label: 'Bao' }, { id: 'bao-2', label: 'Bao 2' },
  { id: 'bread', label: 'Loaf' }, { id: 'cheese', label: 'Cheese' }, { id: 'butter-twerk', label: 'Butter twerk' }, { id: 'ice-cream', label: 'Ice cream' },
  { id: 'popsicle', label: 'Popsicle' }, { id: 'sausage', label: 'Sausage' }, { id: 'sausage-2', label: 'Sausage 2' }, { id: 'fortune', label: 'Fortune' },
  { id: 'coffee-thicc', label: 'Coffee thicc' }, { id: 'gummy-red', label: 'Gummy' }, { id: 'gummy-cheeks', label: 'Gummy cheeks' }, { id: 'pig', label: 'Pig' },
  { id: 'elephant-trunk', label: 'Trunk' }, { id: 'elephant', label: 'Elephant' }, { id: 'corgi', label: 'Corgi' }, { id: 'briefs', label: 'Briefs' }, { id: 'cream-briefs', label: 'Cream briefs' },
  { id: 'plumbers-crack', label: "Plumber's crack" }, { id: 'twerk-vibe', label: 'Twerk vibe' }, { id: 'aperture', label: 'Aperture' }, { id: 'black-hole', label: 'Black hole' },
  { id: 'void-vortex', label: 'Void vortex' }, { id: 'signal-decay', label: 'Signal decay' },
]

export const stickerUrl = (id: string) => `/stickers/${id}.webp`
export const isStickerUrl = (url: string | null | undefined) => !!url && url.startsWith('/stickers/')
