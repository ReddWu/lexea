export const metadata = { title: "Echowords — Support" };

const h2 = { font: "600 18px/1.3 var(--sans)", marginTop: 36 };
const p = { color: "var(--muted)", lineHeight: 1.7 };
const mail = (
  <a href="mailto:reddwu02@gmail.com" style={{ color: "var(--green)" }}>
    reddwu02@gmail.com
  </a>
);

export default function SupportPage() {
  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <h1 className="page-title">Echowords Support</h1>
      <p className="page-sub">Help for the Echowords iPhone app, the Mia browser extension and this website.</p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>Email {mail}. We usually reply within two business days.</p>

      <h2 style={h2}>Saving words on iPhone</h2>
      <p style={p}>
        Select a word or phrase in Safari (or any app), tap <b>Share</b>, then <b>Save to Echowords</b>. If you
        don&apos;t see it, scroll to the end of the app row, tap <b>More</b> and turn Echowords on. Saved words
        appear in the Words tab and come due in Review.
      </p>

      <h2 style={h2}>Reviewing</h2>
      <p style={p}>
        Open Review and grade each card Again, Hard, Good or Easy. Echowords schedules the next review with
        spaced repetition. Turn on reminders in Settings to get one notification a day when words are due.
      </p>

      <h2 style={h2}>Deleting your account</h2>
      <p style={p}>
        In the app, go to Settings → Delete account. This permanently deletes your account and all saved
        words. You can also email {mail} and we will delete it for you.
      </p>

      <h2 style={h2}>Privacy</h2>
      <p style={p}>
        See the <a href="/privacy" style={{ color: "var(--green)" }}>privacy policy</a>.
      </p>
    </div>
  );
}
