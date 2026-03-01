"use client"

import { useEffect } from "react"

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = () => {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
        navigator.serviceWorker.register(`${basePath}/sw.js`)
      }

      if (document.readyState === "complete") {
        register()
      } else {
        window.addEventListener("load", register)
        return () => window.removeEventListener("load", register)
      }
    }
  }, [])
  return null
}
