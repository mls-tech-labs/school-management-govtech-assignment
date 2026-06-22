import "antd/dist/reset.css";
import "./globals.css";
import type { ReactNode } from "react";
import { App as AntdApp, ConfigProvider } from "antd";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "School Portal",
  description: "Private-education administration portal",
};

// CSP is set by `middleware.ts` as a response header (not a meta tag).
// Meta-CSP is parsed before response headers and can't carry a per-request
// nonce; some directives are ignored when delivered via meta.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConfigProvider
          theme={{
            token: { colorPrimary: "#1d4ed8" },
          }}
        >
          {/* antd 5 App context — `App.useApp()` hook needs it to
              access context-bound modal/notification/message. */}
          <AntdApp>
            <SiteHeader />
            <main className="container-page py-6">{children}</main>
          </AntdApp>
        </ConfigProvider>
      </body>
    </html>
  );
}
