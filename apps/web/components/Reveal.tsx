// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Reveal({ children, delay = 0, as: Tag = "div" }: { children: ReactNode; delay?: number; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Any = Tag as "div";
  return (
    <Any ref={ref as never} className="reveal" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Any>
  );
}
