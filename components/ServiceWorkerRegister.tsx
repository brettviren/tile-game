"use client"

import { useEffect } from "react"
import { BASE_PATH } from "@/lib/basePath"

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker.register(`${BASE_PATH}/sw.js`)
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
