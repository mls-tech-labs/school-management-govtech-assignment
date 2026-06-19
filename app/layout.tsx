import "antd/dist/reset.css";
import "./globals.css";
import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "School Portal",
  description: "Private-education administration portal",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConfigProvider
          theme={{
            token: { colorPrimary: "#1d4ed8" },
          }}
        >
          <SiteHeader />
          <main className="container-page py-6">{children}</main>
        </ConfigProvider>
      </body>
    </html>
  );
}
