export const metadata = { title: "Mia — Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <h1 className="page-title">Privacy Policy</h1>
      <p className="page-sub">
        For the Mia browser extension and mia-tutor.vercel.app. Last updated July 15, 2026.
      </p>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>What Mia collects</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        When you select a word or short phrase and click <b>Save to Mia</b>, the extension stores: the selected text, the
        sentence it appeared in, and the URL and title of the page you found it on. Nothing is
        collected from pages where you don&apos;t save a word — the extension never reads or
        transmits your browsing history, page contents, or anything you didn&apos;t explicitly
        save.
      </p>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        If you sign in with Google, Mia stores your Google account&apos;s email address, display
        name, and avatar to identify your library. Signing in is optional — without it the
        extension works fully locally and nothing leaves your device.
      </p>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>Where it goes</h2>
      <ul style={{ color: "var(--muted)", lineHeight: 1.9, paddingLeft: 22 }}>
        <li>
          <b>Your device first.</b> Saved words live in the extension&apos;s local storage in your
          browser. Phonetics and 中文 glosses come from dictionaries bundled inside the extension —
          those lookups never leave your machine.
        </li>
        <li>
          <b>Mia&apos;s backend.</b> When you are signed in, saved words sync to your private,
          per-account library (mia-tutor.vercel.app) so flashcards and tutoring sessions stay in
          step across the web app. Your words are only visible to your account.
        </li>
        <li>
          <b>Dictionary lookup.</b> The saved word or phrase (only the selected expression) may be sent to
          dictionaryapi.dev to fetch a phonetic transcription and definition.
        </li>
      </ul>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>What Mia doesn&apos;t do</h2>
      <ul style={{ color: "var(--muted)", lineHeight: 1.9, paddingLeft: 22 }}>
        <li>No ads, no analytics trackers, no selling or sharing of your data with third parties.</li>
        <li>No collection of passwords, payment details, or form input.</li>
        <li>No reading of pages beyond the expression and sentence you explicitly select and save.</li>
      </ul>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>Deleting your data</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        Deleting an expression in the extension or the web app removes it locally and from the backend.
        Uninstalling the extension removes all locally stored data. To request full deletion of
        synced data, email{" "}
        <a href="mailto:reddwu02@gmail.com" style={{ color: "var(--green)" }}>
          reddwu02@gmail.com
        </a>
        .
      </p>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>Contact</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        Questions about this policy:{" "}
        <a href="mailto:reddwu02@gmail.com" style={{ color: "var(--green)" }}>
          reddwu02@gmail.com
        </a>
      </p>
    </div>
  );
}
