import Link from "next/link";

/** The WORFIX mark (public/worfix-logo.svg, supplied by the team) with the wordmark. */
export function Logo({ href = "/", compact }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="logo" aria-label="WORFIX">
      <img src="/worfix-logo.svg" alt="" width={49} height={26} />
      {!compact && <span className="logo-word">WORFIX</span>}
    </Link>
  );
}
