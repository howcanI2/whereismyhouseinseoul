"use client";
import dynamic from "next/dynamic";

// The app reads window size, the URL hash and the Kakao SDK, so it renders in the browser only.
const App = dynamic(() => import("../src/App.jsx"), { ssr: false });

export default function Page() {
  return <App />;
}
