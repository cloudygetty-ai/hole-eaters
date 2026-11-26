# Age assurance plan (PA, NJ and expansion)

Checked Nov 26, 2026. Not legal advice: confirm coverage with a lawyer before acting.

## Where things stand

| State | Law today | What's moving |
| --- | --- | --- |
| Pennsylvania | No ID-based age check required for adult sites | **SB 603.** Senate Judiciary adopted an amendment 14–0 and reported it 12–2 on Sep 28, 2026 (PN 1971). Second consideration Sep 29. No final Senate vote yet and nothing in the House (companion HB 1513 sits in House Communications & Technology). |
| New Jersey | No adult-content age-check law | S 1826 (Senate Judiciary, Jan 2026), identical A 5305 and separate A 3228 (both in Assembly Science, Innovation & Technology). No action past referral. |
| Elsewhere | About two dozen states have adult-content age-check laws, upheld by *Free Speech Coalition v. Paxton* (2025) | Check each state before launching there. |

**Timing.** Pennsylvania's 2025–26 session ends Nov 30, 2026. Bills that haven't passed both chambers by then lapse, so SB 603 most likely has to be reintroduced in the 2027–28 session. Plan for it to come back, probably early in 2027, rather than treat it as dead.

**What SB 603 would require, as amended:**
- **Who:** commercial sites where more than one-third of the material is "harmful to minors".
- **How:** a third-party check against commercial identity databases, or any commercially reasonable method using public or private transaction data.
- **Data:** the site and the verifier may not keep identifying information after the check.
- **Enforcement:** private lawsuits (damages, costs and attorney fees), not the attorney general.
- **When:** 90 days after it's signed.

**Open question for counsel:** does Hole Eaters cross the one-third line? Profiles are mostly text and photos, but explicit photos are allowed, so plan as if it does.

## What would change in a gated state

- **"Ghost in, no email" needs an age check first.** Today it skips any check.
- **The map and photos load only after a pass.**
- **Video posting stays gated** on its own ID check, which still says "Verification opens soon". Keep it unpromoted until a provider is live.

## Build plan (start before expanding; ship inside the 90 days)

1. **One provider for both checks.** Site age checks and video-poster ID checks use the same vendor (see the `TODO[P0]` in `src/components/VideoFeed.tsx`). It must offer an age-only result and a full document check, keep no data, and report results by webhook.
2. **Store only the result:** `age_checks(user_id, method, provider_ref, passed_at, expires_at)`. No ID images, birth dates or names.
3. **One gate, switched on per state:** `age_check_required(region)` reads a `gated_regions` table. Off everywhere today; turning a state on is a config change, not a deploy.
4. **Region:** IP region at the landing gate, GPS once the map is open; gate on either. Log mismatches (VPNs) and keep handling simple at first.
5. **Copy:** a short "why we ask" screen, plus one line on `/safety` and `/privacy` saying what's checked and that nothing is kept.
6. **Admin:** checks passed, failed and pending per region in Admin › Stats.

## Watch list

- **PA:** whether SB 603 gets a final Senate vote before Nov 30, 2026; if not, the reintroduced bill's number and sponsor in early 2027.
- **NJ:** committee movement on S 1826, A 5305 or A 3228.
- **Expansion states:** each one's age-check law and coverage threshold.

Sources checked: the PA General Assembly's SB 603 bill page (action history and committee votes), Reclaim The Net's SB 603 tracker (amended text summary and HB 1513), and RecordingLaw's New Jersey age-verification page (NJ bill status).
