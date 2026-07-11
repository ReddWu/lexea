import Link from "next/link";

export const metadata = { title: "Get the Mia extension" };

export default function ExtensionPage() {
  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <h1 className="page-title">Save words while you read</h1>
      <p className="page-sub">
        The Mia browser extension captures any word you select — together with the sentence you
        found it in — and syncs it straight into your library. Chrome Web Store listing pending;
        install it in 30 seconds meanwhile:
      </p>

      <ol style={{ lineHeight: 2.1, paddingLeft: 22, fontSize: 15 }}>
        <li>
          <a
            href="/mia-extension.zip"
            className="btn green"
            style={{ marginRight: 10 }}
            download
          >
            Download mia-extension.zip
          </a>
          and unzip it
        </li>
        <li>
          Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right)
        </li>
        <li>
          Click <b>Load unpacked</b> and select the unzipped folder
        </li>
      </ol>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>Then try it</h2>
      <p style={{ color: "var(--muted)" }}>
        Select any English word on any page → click <b>★ Save to Mia</b>. A card pops up with the
        phonetic, a plain-English meaning for the exact sense in your sentence, and a 中文 button
        when you need it. The word lands in{" "}
        <Link href="/" style={{ color: "var(--green)" }}>
          your library
        </Link>{" "}
        — and <Link href="/tutor" style={{ color: "var(--green)" }}>Mia</Link> will start weaving
        it into your conversations.
      </p>
    </div>
  );
}
