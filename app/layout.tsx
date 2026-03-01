import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { Viewport } from "next"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister"

const inter = Inter({ subsets: ["latin"] })
export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
  return (
    <html lang="en" className="h-full w-full overscroll-none">
      <head>
        <title>ExponenTile</title>
        <link rel="manifest" href={`${basePath}/manifest.json`} />
        <meta
          name="theme-color"
          content="#020617"
          media="(prefers-color-scheme: dark)"
        />
        <meta name="theme-color" content="#f8fafc" />
      </head>
      <body
        className={`${inter.className} h-full w-full overscroll-none bg-slate-50 dark:bg-slate-950`}
      >
        <ServiceWorkerRegister />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
