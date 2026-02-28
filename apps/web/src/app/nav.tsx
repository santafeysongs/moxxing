'use client';

import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();
  const isLanding = pathname === '/' || pathname === '/mockup';

  if (isLanding) return null;

  return (
    <>
      <style>{`
        @keyframes navChrome {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      <nav style={{
        display: 'flex', alignItems: 'center',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: '#fff',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <a href="/" style={{
          fontFamily: 'var(--font-unbounded)', fontWeight: 900, fontSize: '0.85rem',
          textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.08em',
          background: 'linear-gradient(135deg, #888, #fff, #999, #fff, #aaa, #fff, #888)',
          backgroundSize: '300% 300%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'navChrome 8s ease-in-out infinite',
        }}>
          MOXX UP
        </a>
      </nav>
    </>
  );
}
