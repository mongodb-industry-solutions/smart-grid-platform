import "./globals.css";
import { Providers } from "./providers";
import AppShell from "@/components/general/AppShell";
import AppHeader from "@/components/general/AppHeader";
import DemoStartModal from "@/components/demo/DemoStartModal";

export const metadata = {
  title: "Smart Meter Demo",
  description: "A demo application for smart meter data visualization and analysis.",
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
          <DemoStartModal />
        </Providers>
      </body>
    </html>
  );
}
