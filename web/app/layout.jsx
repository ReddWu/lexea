import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Mia — the words you save show up in every conversation",
  description:
    "Save words while you read. Mia schedules them on your forgetting curve and weaves them back into natural AI conversation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <Link className="brand" href="/">
            Mia
          </Link>
          <div className="navlinks">
            <Link href="/">Library</Link>
            <Link href="/review">Flashcards</Link>
            <Link href="/memory">Memory</Link>
            <Link href="/extension">Extension</Link>
            <Link className="pill" href="/tutor">
              Talk to Mia
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
