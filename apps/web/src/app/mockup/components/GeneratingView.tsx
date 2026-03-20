'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useIsMobile } from './useIsMobile';

interface GeneratingViewProps {
  onTimeout: () => void;
  onRetry: () => void;
}

const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export default function GeneratingView({ onTimeout, onRetry }: GeneratingViewProps) {
  const [timedOut, setTimedOut] = useState(false);
  const isMobile = useIsMobile();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setTimedOut(false);
    timerRef.current = setTimeout(() => {
      setTimedOut(true);
      onTimeout();
    }, TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, [onTimeout]);

  if (timedOut) {
    return (
      <div style={{ background: '#000', minHeight: '100vh', position: 'relative' }}>
        {isMobile
          ? <div className="static-bg" />
          : <video autoPlay loop muted playsInline src="/0227.mov" className="video-bg" style={{ opacity: 0.3 }} />
        }
        <div style={{
          position: 'relative', zIndex: 1, minHeight: '100vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{ width: '320px', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-unbounded)', fontSize: '0.7rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)',
              marginBottom: '16px',
            }}>
              Generation timed out
            </div>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', marginBottom: '24px', lineHeight: 1.6 }}>
              This is taking longer than expected. You can retry or go back.
            </p>
            <button onClick={onRetry} style={{
              padding: '14px 32px', fontSize: '0.65rem', fontWeight: 700,
              fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.15em',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#000', minHeight: '100vh', position: 'relative' }}>
      {isMobile
        ? <div className="static-bg" />
        : <video autoPlay loop muted playsInline src="/0227.mov" className="video-bg" style={{ opacity: 0.3 }} />
      }
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: '280px', textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-unbounded)', fontSize: '0.7rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)',
            marginBottom: '24px',
          }}>
            Generating
          </div>
          <div style={{
            width: '100%', height: '2px', background: 'rgba(255,255,255,0.06)',
            borderRadius: '1px', overflow: 'hidden',
          }}>
            <div style={{
              width: '30%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
              animation: 'slide 2s ease-in-out infinite',
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
