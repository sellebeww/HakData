// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // preflight dimatikan: stylesheet MVP (globals.css) sudah punya reset sendiri dan tidak boleh berubah tampilan.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
export default config;
