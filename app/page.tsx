"use client";
import { useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/frequency-atlas";
const cloudReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export default function Home() {
  const target = cloudReady ? `${basePath}/cloud/` : `${basePath}/prototype.html`;
  useEffect(() => { window.location.replace(target); }, [target]);
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <p>Frequency Atlas · <a href={target}>Відкрити застосунок</a></p>
  </main>;
}
