import "./globals.css";
import Link from "next/link";
import AuthNav from "./AuthNav";

export const metadata = {
  title: "Echowords — the words you save show up in every conversation",
  description:
    "Save words while you read. Echowords schedules them on your forgetting curve and weaves them back into natural AI conversation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <Link className="brand" href="/">
            Echowords
          </Link>
          <div className="navlinks">
            <Link href="/">Library</Link>
            <Link href="/review">Flashcards</Link>
            <Link href="/memory">Memory</Link>
            <Link href="/extension">Extension</Link>
            <Link className="pill" href="/tutor">
              Talk to Mia
            </Link>
            <AuthNav />
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
