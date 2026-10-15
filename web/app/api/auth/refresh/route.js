// POST /api/auth/refresh — standard SSR refresh endpoint. The browser client
// calls this when insforge_access_token is missing or expired; the httpOnly
// refresh cookie mints a new access token.
import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

export const dynamic = "force-dynamic";

export const { POST } = createRefreshAuthRouter();
