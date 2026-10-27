"use client";
import { useEffect } from "react";
import { HeroUIProvider } from "@heroui/react";

export default function Providers({ children }) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.classList.toggle("dark", mq.matches); document.documentElement.style.colorScheme = mq.matches ? "dark" : "light"; };
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return <HeroUIProvider locale="ko-KR">{children}</HeroUIProvider>;
}
