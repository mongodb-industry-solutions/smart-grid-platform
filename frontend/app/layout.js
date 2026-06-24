import "./globals.css";
import { Providers } from "./providers";
import AppShell from "@/components/general/AppShell";
import AppHeader from "@/components/general/AppHeader";

export const metadata = {
  title: "Demo Template",
  description: "Industry Solutions Demo Template for NextJS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <Providers>
          <div className="flex h-screen flex-col">
            <AppHeader />
            <AppShell>{children}</AppShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
