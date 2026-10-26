import Link from "next/link";

export const metadata = { title: "Get the Echowords extension" };

export default function ExtensionPage() {
  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <h1 className="page-title">Save words while you read</h1>
      <p className="page-sub">
        The Echowords browser extension captures any word or short phrase you select — together with the sentence you
        found it in — and syncs it straight into your library. Install it from the{" "}
        <a href="https://chromewebstore.google.com/detail/bakaoahlcnpnefebfoiogckiaiehngmk" style={{ color: "var(--green)" }}>
          Chrome Web Store
        </a>
        , or load the latest build yourself in 30 seconds (turn off the store copy first so you don't get two):
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
          Click <b>Load unpacked</b> and select the unzipped <code>mia-extension</code> folder, then sign in from its popup
        </li>
      </ol>

      <h2 style={{ font: "600 18px/1.3 var(--sans)", marginTop: 36 }}>Then try it</h2>
      <p style={{ color: "var(--muted)" }}>
        Select a word or short phrase on any page → click <b>★ Save to Echowords</b>. A card pops up with the
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
