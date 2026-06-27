import "./globals.css";

export const metadata = {
  title: "单词复习 · 艾宾浩斯",
  description: "用间隔重复(SM-2 / 艾宾浩斯遗忘曲线)复习你的单词,跨设备。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
