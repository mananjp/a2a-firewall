"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-6 w-6 shrink-0 grid-cols-2 grid-rows-2 gap-[2px]">
        <span className="bg-ink" />
        <span className="bg-violet" />
        <span className="bg-lime" />
        <span className="bg-ink" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight">A2A_</span>
    </Link>
  );
}

const NAV = [
  { label: "Sandbox", href: "/#sandbox" },
  { label: "Pipeline", href: "/#pipeline" },
  { label: "Architecture", href: "/#architecture" },
  { label: "Capabilities", href: "/#capabilities" },
];

export function SiteHeader() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-ink/20 bg-paper/90 backdrop-blur">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Logo />
          <nav className="hidden min-w-0 items-center gap-1 border-l border-ink/20 pl-6 lg:flex">
            {NAV.map((item, i) => (
              <span key={item.label} className="flex items-center">
                {i > 0 && <span className="label-mono px-2 text-muted-foreground">/</span>}
                <a
                  href={item.href}
                  className="label-mono px-1 py-1 text-ink transition-colors hover:text-violet"
                >
                  {item.label}
                </a>
              </span>
            ))}
            <span className="label-mono px-2 text-muted-foreground">/</span>
            <a
              href="https://github.com/mananjp/a2a-firewall"
              target="_blank"
              rel="noreferrer"
              className="label-mono px-1 py-1 text-ink transition-colors hover:text-violet"
            >
              GitHub
            </a>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden border border-ink/20 px-3 py-1.5 font-mono text-[10px] leading-tight text-muted-foreground md:block">
            <div>SYS.TIME</div>
            <div className="text-ink">{time}</div>
            <div>UTC+0</div>
          </div>
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 border border-ink bg-ink px-4 py-3 label-mono text-paper transition-colors hover:bg-violet hover:border-violet"
          >
            Access SOC
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/20">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs font-mono text-xs leading-relaxed text-muted-foreground">
            Zero-trust inter-agent security &amp; governance mesh. Ed25519, Macaroons, Groq LPU.
          </p>
          <p className="mt-6 label-mono text-muted-foreground">© 2026 A2A Firewall</p>
        </div>
        <FooterCol
          title="Navigation"
          links={[
            ["Sandbox", "/#sandbox"],
            ["Pipeline", "/#pipeline"],
            ["Architecture", "/#architecture"],
            ["Capabilities", "/#capabilities"],
          ]}
        />
        <FooterCol
          title="Resources"
          links={[
            ["SOC Dashboard", "/dashboard"],
            ["Sign In", "/login"],
            ["GitHub", "https://github.com/mananjp/a2a-firewall"],
          ]}
        />
        <div>
          <h3 className="label-mono text-muted-foreground">Global Node</h3>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs">
            {["LON", "NY", "TYO", "BER"].map((n, i) => (
              <span key={n} className="flex items-center gap-3">
                {i > 0 && <span className="text-violet">+</span>}
                {n}
              </span>
            ))}
          </div>
          <div className="mt-6 border border-ink/20 bg-lime px-3 py-2 label-mono text-lime-foreground">
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="label-mono text-muted-foreground">{title}</h3>
      <ul className="mt-4 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("http") ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-ink hover:text-violet"
              >
                {label}
              </a>
            ) : href.startsWith("/#") ? (
              <a href={href} className="font-mono text-xs text-ink hover:text-violet">
                {label}
              </a>
            ) : (
              <Link href={href} className="font-mono text-xs text-ink hover:text-violet">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SectionHead({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-4 border-b border-ink/20 pb-4">
      <span className="label-mono text-violet">/{index}</span>
      <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      {children}
    </div>
  );
}
