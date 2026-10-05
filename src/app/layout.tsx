import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
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
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <head>
        {/* Thème : clair par défaut, sombre si préféré ou mémorisé.
            Script inline AVANT le premier rendu pour éviter le flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  var dark = saved
                    ? saved === 'dark'
                    : window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
        {/* Service Worker : uniquement dans les builds de production (npm run build
            puis npm start, ou déploiement). En dev, pas de SW pour ne pas gêner le
            hot-reload. C'est lui qui rend l'app utilisable hors ligne (PWA). */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
              (function() {
                console.log('[App] Initializing application...');

                if ('serviceWorker' in navigator) {
                  let newWorkerWaiting = false;

                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('[SW] ServiceWorker registration successful with scope: ', registration.scope);

                      // Listen for updates
                      registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        console.log('[SW] New version found!');

                        newWorker?.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[SW] New version ready, waiting for user to refresh');
                            newWorkerWaiting = true;

                            // Store in localStorage for React component to check
                            localStorage.setItem('swUpdateAvailable', 'true');

                            // Dispatch custom event for React components
                            window.dispatchEvent(new CustomEvent('swUpdateAvailable'));
                          }
                        });
                      });

                    }, function(err) {
                      console.error('[SW] ServiceWorker registration failed: ', err);
                    });
                  });

                  // Listen for controller change (when new SW takes control)
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('[SW] New service worker activated, clearing update flag and reloading');
                    // Clear the update flag since the new SW is now active
                    localStorage.setItem('swUpdateAvailable', 'false');
                    window.location.reload();
                  }, { once: true });

                } else {
                  console.log('[SW] Service workers not supported in this browser');
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
        )}
      </head>
      <body
        style={{
          fontFamily: "var(--font-sans)",
        }}
      >
        <AppProvider>{children}</AppProvider>
        <ServiceWorkerUpdate />
        <Analytics />
      </body>
    </html>
  );
}
