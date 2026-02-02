import type { Metadata, Viewport } from "next";
import { Crimson_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Review IABD - Application de Révision",
  description: "Application PWA permettant de réviser le domaine IABD (Intelligence Artificielle et Big Data) via des QCM générés par IA.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Review IABD",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1419",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Initialize services immediately
              (function() {
                console.log('[App] Initializing application...');

                // Register Service Worker only in production
                if ('serviceWorker' in navigator && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('[SW] ServiceWorker registration successful with scope: ', registration.scope);
                    }, function(err) {
                      console.error('[SW] ServiceWorker registration failed: ', err);
                    });
                  });
                } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                  console.log('[SW] Service Worker disabled in development mode');
                }

                // Listen for online/offline events
                window.addEventListener('online', function() {
                  console.log('[App] Connection status: ONLINE');
                });
                window.addEventListener('offline', function() {
                  console.log('[App] Connection status: OFFLINE');
                });

                // Log initial connection status
                console.log('[App] Initial connection status:', navigator.onLine ? 'ONLINE' : 'OFFLINE');
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${crimsonPro.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-serif)",
        }}
      >
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
