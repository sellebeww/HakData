// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 110 100" role="img" aria-label="Hak Data">
      <defs>
        <linearGradient id="hd-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00c8ff" />
          <stop offset=".55" stopColor="#2a5cff" />
          <stop offset="1" stopColor="#8a2cff" />
        </linearGradient>
        <mask id="hd-m">
          <rect width="110" height="100" fill="#fff" />
          <circle cx="62" cy="44" r="10" fill="#000" />
          <path d="M55 52h14l4 22H51z" fill="#000" />
        </mask>
      </defs>
      <rect x="2" y="30" width="9" height="9" rx="2.5" fill="url(#hd-g)" className="px px1" />
      <rect x="14" y="22" width="5" height="26" rx="2" fill="url(#hd-g)" className="px px2" />
      <path mask="url(#hd-m)" fill="url(#hd-g)" d="M30 6h30a44 44 0 0 1 0 88H30a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8z" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={34} />
      <span>Hak<b>Data</b></span>
    </span>
  );
}
