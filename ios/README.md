# Mia for iOS

SwiftUI app + "Save to Mia" share extension. Same InsForge backend and `words`
table as the website and Chrome extension.

## Run

```bash
brew install xcodegen
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # fill in URL + anon key
xcodegen generate
open Mia.xcodeproj
```

Pick your team under Signing & Capabilities for both `Mia` and `MiaShare`
before running on a device (the App Group `group.com.reddwu.mia` gets
registered automatically).

Build from Xcode or with `xcodebuild` using the default DerivedData. A
`-derivedDataPath` inside `~/Documents` fails codesign ("resource fork …
detritus") because iCloud adds extended attributes.

## How it fits together

- **Auth:** Google via InsForge OAuth (`mia://auth/callback` must be in
  `allowed_redirect_urls`, see `../insforge.toml`), or email + password, where
  new accounts confirm with a 6-digit emailed code. Google's passkey step can
  need Bluetooth, which the simulator lacks, so use email there. Session lives
  in the Keychain.
- **Data:** reads and writes `public.words` directly. RLS limits every row to
  `auth.uid()`.
- **Share extension:** queues words in the App Group (`pending-captures.json`)
  without touching the network. The app pushes the queue when it becomes active.
- **Definitions:** `POST {MIA_WEB_URL}/api/define` with the user's token, with
  dictionaryapi.dev as the English fallback. Results get written back to the row.
- **Tutor (Mia tab):** streams `POST {MIA_WEB_URL}/api/tutor` (NDJSON), the same
  agent the website uses. When Mia saves or grades a word, the word list refreshes.
  Each user's conversation is kept in Application Support.
- **Reminders:** local notifications for the next 7 days at the chosen time,
  counted from real due dates and replanned whenever the words change. The app
  icon badge shows how many words are due.
- **Parity:** `Shared/SRS.swift` and `Shared/Lemma.swift` are ports of
  `web/lib/srs.js` and the lemma logic in `extension/background.js`.
  `Tests/PortParityTests.swift` pins them to values produced by the JS.
