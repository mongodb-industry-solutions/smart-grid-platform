import "./globals.css";
import { Providers } from "./providers";
import AppShell from "@/components/general/AppShell";

export const metadata = {
  title: "Demo Template",
  description: "Industry Solutions Demo Template for NextJS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
