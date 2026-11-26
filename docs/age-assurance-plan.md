# Age assurance plan (PA, NJ and expansion)

Status as of Nov 26, 2026. Not legal advice: confirm coverage with a lawyer before acting.

## Where things stand

| State | Law today | What's moving |
| --- | --- | --- |
| Pennsylvania | No ID-based age check required for adult sites | **SB 603** reported out of Senate Judiciary 12–2 on Sep 28, 2026 (amended, PN 1971). Next: further Senate consideration, then the House. HB 1513 and HB 2215 sit in committee. |
| New Jersey | No adult-content age-verification law | S 1826 is in Senate Judiciary. The NJ Kids Code is a design-code law, not an ID check. |
| Elsewhere | More than two dozen states have adult-content age-check laws, upheld by *Free Speech Coalition v. Paxton* (2025) | Check each state before launching there. |

What SB 603 would require, as amended:
- **Who:** commercial sites where more than one-third of the content is "harmful to minors".
- **How:** a third-party check against commercial databases, or one based on commercially reasonable transaction data.
- **Data:** nobody may keep the identifying information after the check. Anyone harmed by wrongful retention can sue.
- **When:** 90 days after it is signed.

Open question for counsel: does Hole Eaters cross the one-third line? Profiles are mostly text and photos, but explicit photos are allowed, so assume yes.

## What would change for members in PA if SB 603 passes

- **Browsing without an email would need an age check first.** Today "Ghost in — no email" skips any check, so it conflicts with the law.
- **The 90-day window is the build deadline,** counted from the day the bill is signed.
- **Video posting is already gated** on an ID check that isn't live ("Verification opens soon"). Keep it off and unpromoted until a provider is contracted.

## Build plan (start before any expansion, ship within the 90 days)

1. **One provider for both checks.** Video-poster ID checks and site age checks should use the same vendor (Yoti, Veriff or Persona; see the `TODO[P0]` in `VideoFeed.tsx`). It must:
   - offer an age-only result and a full document check;
   - not retain data, matching SB 603;
   - send results by webhook.
2. **Store only the result.**
   - New table: `age_checks(user_id, method, provider_ref, passed_at, expires_at)`.
   - No ID images, birth dates or names. The provider keeps nothing either, by contract.
3. **One gate, switched on per state.**
   - New function: `age_check_required(region)`, driven by a `gated_regions` config table.
   - Off everywhere today. Turning on a state is a config change, not a deploy.
4. **Region detection.**
   - Use the visitor's IP region at the landing gate (Vercel's geo headers).
   - Use GPS once the map is open, and gate on either one.
   - Keep VPN handling simple for now, and log the mismatches.
5. **Where the gate sits in a gated state:**
   - before the map and photos load;
   - before an anonymous session starts (Ghost in);
   - before any video posting.
6. **Copy and pages:**
   - a short "why we ask" screen;
   - a line on the [Safety](/safety) and [Privacy](/privacy) pages saying what is checked and that nothing is kept.
7. **Admin:** show the count of checks passed, failed and pending per region in Admin › Stats.

## Watch list

- PA SB 603: Senate floor vote, House referral, signature date (starts the 90-day clock).
- NJ S 1826: committee movement.
- Any state on the expansion list: its age-check law and its coverage threshold.

Sources: [ID Tech, PA Senate committee advances SB 603 (Sep 29, 2026)](https://idtechwire.com/pennsylvania-senate-committee-advances-adult-site-age-verification-bill/) · [BillTrack50, PA SB 603](https://www.billtrack50.com/billdetail/1884197) · [RecordingLaw, Pennsylvania age verification law](https://www.recordinglaw.com/us-laws/age-verification-laws/pennsylvania-age-verification-law/) · [RecordingLaw, New Jersey age verification law](https://www.recordinglaw.com/us-laws/age-verification-laws/new-jersey-age-verification-law/)
