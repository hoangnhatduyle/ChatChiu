# Open questions

Each question has a **default** I will use if no answer arrives before the step that needs it.

## Needed before Phase 0 finishes

| # | Question | Why it matters | Default |
|---|---|---|---|
| ~~Q1~~ | Sideload an APK on the Fire? | **Answered: yes** (D14) | — |
| ~~Q2~~ | Email digest fallback? | **No longer needed** (D14) | — |
| ~~Q3~~ | Her phone? | **Answered: iPhone** (D15) | — |
| ~~Q4~~ | Current web address? | **Answered:** `https://inventory-tracking-app-five.vercel.app` (D16) | — |
| ~~Q11~~ | Old app on her iPhone Home Screen? | **Answered:** yes, with notifications on, but **nothing arrives** (D17), so it gets diagnosed in step 0.8. The old icon is replaced at cutover. | — |
| ~~Q12~~ | Vercel and Supabase access from this machine? | **Answered: yes** (D18) | — |
| Q5 | **Timezone and time** for the daily expiry reminder? (The old cron sent at 13:00 UTC.) | F-NT-02 | Device timezone, 9:00 |

## Needed before the matching feature step

| # | Question | Step | Default |
|---|---|---|---|
| Q6 | Currency shown for money stats: **$** like the old app? | 5.7 | $ (USD) |
| Q7 | Is the 3-day "Use soon" window right, or should it follow each item's "remind me N days before" setting? | 5.1 | Fixed 3 days (same as old) |
| Q8 | When ticking an item **purchased** on the shopping list, should the app offer "Add to kitchen"? This would be a **new** feature, not in the old app. | 5.5 | No (keeps parity); listed under Later |
| Q9 | Does she use the "Recently added" and "by category / by location" counts on the old Stats view? | 5.7 | Keep them on Waste & Stats |
| Q10 | Should **Remove** (from the used-up toast) also log the item somewhere, or just delete it like today? | 5.2 | Just delete (same as old; "Move to waste" is the logging action) |

## Later (explicitly out of scope for this rewrite)

- Item photos and barcode scanning (D3): re-enable on request.
- Separate logins sharing one kitchen ("household"): needs a schema change.
- "Add to kitchen" from the shopping list (Q8).
- Vietnamese UI language.
