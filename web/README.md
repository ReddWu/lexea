# 单词复习网站(Next.js · 部署到 Vercel)

跨设备的间隔重复(SM-2 / 艾宾浩斯)复习网站,读写你 InsForge 云端的 `words` 表。配合扩展用:扩展采集 + 同步上云 → 这个网站在任何浏览器/手机上复习。

- `anon key` 只在**服务端**(`/app/api/*` 经 `lib/cloud.js` 访问云端),不进浏览器、不进仓库。
- 可选**密码门**(`APP_PASSWORD`)。

## 环境变量

| 变量 | 说明 |
|---|---|
| `INSFORGE_OSS_HOST` | 你的 InsForge `oss_host`(见 `.insforge/project.json`) |
| `INSFORGE_ANON_KEY` | `anon_` 开头的 key(不是 `ik_` 管理员密钥) |
| `APP_PASSWORD` | 可选。设了就要密码进站;留空 = 公开站 |

> ⚠️ 三个都**不要**加 `NEXT_PUBLIC_` 前缀——必须保持服务端私有。

## 本地跑

```bash
cd web
cp .env.local.example .env.local   # 填上面三个变量
npm install
npm run dev                        # http://localhost:3000
```

## 部署到 Vercel

**方式 A:Vercel CLI(最快)**

```bash
cd web
npx vercel            # 首次会让你登录 + 创建项目(Root Directory 选当前 web 目录)
# 在 Vercel 控制台 → Project → Settings → Environment Variables 加上面三个变量
npx vercel --prod     # 正式部署
```

**方式 B:Git + Vercel 控制台**

把仓库推到 GitHub → Vercel「Add New Project」导入 → **Root Directory 设为 `web`** → 加好三个环境变量 → Deploy。

## 页面

- `/` 看板:到期/新词/复习中/已掌握/总计,未来 7 天复习日程,全部单词(可删)。
- `/review` 复习:正面词、空格显示答案、背面在线释义 + 高亮例句、`1 忘 / 2 难 / 3 会 / 4 简单`(键盘也行),按 SM-2 安排下次。
- `/login` 仅当设了 `APP_PASSWORD` 时出现。
