import "antd/dist/reset.css";
import "./globals.css";
import type { ReactNode } from "react";
import { App as AntdApp, ConfigProvider } from "antd";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "School Portal",
  description: "Private-education administration portal",
};

/**
 * Root layout.
 *
 * CSP is emitted as a response header by `middleware.ts` ONLY.
 * We deliberately do NOT emit a `<meta http-equiv="Content-Security-Policy">`
 * tag here because:
 *
 *   1. The browser enforces the UNION of header-CSP + meta-CSP.
 *      If the meta tag's policy is stricter (e.g. it omitted a
 *      nonce because it was rendered before middleware ran), the
 *      union still blocks the framework's inline scripts.
 *
 *   2. The browser parses meta-CSP BEFORE the response headers
 *      arrive, so a meta tag with a per-request nonce is
 *      fundamentally racy — the nonce in the meta tag is fixed
 *      at render time and can't match the one middleware just
 *      minted for the same request.
 *
 *   3. Some directives (`frame-ancestors`, `report-uri`,
 *      `sandbox`) are IGNORED when delivered via a meta tag —
 *      the browser console will log a warning and the directive
 *      won't take effect.
 *
 * Net effect: the response header from middleware is the single
 * source of truth for CSP, and this layout stays out of the way.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConfigProvider
          theme={{
            token: { colorPrimary: "#1d4ed8" },
          }}
        >
          {/* antd 5 App context — required so that the
              `App.useApp()` hook in client components can access
              the context-bound `modal.confirm` / `notification` /
              `message` instances. The static `Modal.confirm` still
              works but does not pick up ConfigProvider theme +
              locale overrides; using the App context is the
              recommended antd 5 path. */}
          <AntdApp>
            <SiteHeader />
            <main className="container-page py-6">{children}</main>
          </AntdApp>
        </ConfigProvider>
      </body>
    </html>
  );
}
