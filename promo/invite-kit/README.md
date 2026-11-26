# Hole Eaters invite kit

Everything here is ready to use once the `growth/invite-reward` branch is merged. Until then the short links below return "not found" on hole-eaters.com.

## The reward (what people get for inviting)

- **Spotlight:** every person who joins from your in-app link (Me > Invite people) puts you at the top of the nearby list, with a gold pin on the map, for 24 hours. It stacks, up to a week ahead.
- **Founding Eater:** bring 3 people and you get a permanent badge on your profile.
- Only brand-new profiles count (joined in the last 24 hours), and never yourself.

The short links below don't carry anyone's invite code. They count by channel, so you can see which ones work in **Admin > Stats > Promo sources**.

## Links

| Where it goes | Link | Shows in Promo sources as |
|---|---|---|
| Your Grindr bio | hole-eaters.com/g | grindr-bio |
| Your Sniffies bio | hole-eaters.com/s | sniffies-bio |
| Group chats | hole-eaters.com/chat | group-chat |
| QR code for any bar | hole-eaters.com/v/bar | qr-bar |
| QR code for any event | hole-eaters.com/v/event | qr-event |
| One venue or night | hole-eaters.com/v/your-venue | qr-your-venue |
| One promoter or creator | hole-eaters.com/p/their-name | partner-their-name |

Venue and partner names: letters, numbers and dashes, up to 30 characters. You can make a new one just by using it; nothing needs setting up.

## Bio lines

Keep these plain text. Some apps hide profiles that look like ads, and a short link is easy to type.

**Grindr**
- Also on Hole Eaters, the live map of who's out tonight: hole-eaters.com/g
- Find my pin 📍 hole-eaters.com/g
- Pulse Rooms on the big nights. hole-eaters.com/g

**Sniffies**
- Building Hole Eaters, a live cruising map for Philly. Everyone's welcome: hole-eaters.com/s
- Map me on Hole Eaters too 👀 hole-eaters.com/s

## Group chat message

> I started a live cruising map for Philly and South Jersey called Hole Eaters. It's free, it runs in your browser, and everyone's welcome. Come drop a pin: hole-eaters.com/chat

Short version:

> Who's out tonight? hole-eaters.com/chat

## QR codes

- `qr/bar.png`, `qr/event.png`: 1200 px codes with the emblem in the middle. `.svg` versions for print shops.
- `cards/bar-card-4x6.png`, `cards/event-card-4x6.png`: 4x6 in at 300 dpi, for table tents, posters and flyers.
- Venue stickers with their own link: `python3 scripts/qr_stickers.py venue-name another-venue --out stickers.pdf`
- Every code was checked with a scanner at full and small size. Print them at least 1 inch (2.5 cm) wide.

## Promoter and creator pitch

For promoters (DM or text):

> Hey [name], I run Hole Eaters (hole-eaters.com), a live map for cruising and hooking up around Philly. It's free and open to everyone. I'd love to partner on your nights. You'd get your own link and QR code (hole-eaters.com/p/[your-name]) so we can both see exactly how many people you bring in, and I'll open a Pulse Room on the map the night of your event so your crowd can find each other. No cost to you. Want me to set yours up?

For creators:

> Love what you post. I run Hole Eaters, a free live cruising map (hole-eaters.com). Want your own link to share with your followers? I'll send you the sign-up count from it every week.

What you can offer a partner today, without paying anything:

- Their own link and QR code, with sign-up counts from Promo sources.
- A Pulse Room on the map for their night.
- If they share their own in-app invite link instead, they earn the Spotlight and the Founding Eater badge themselves.
