'use client';

import { useState } from 'react';
import { API } from './types';

const TIERS = [
  { id: '1h', label: '1 HOUR', price: '$5', tag: null },
  { id: '4h', label: '4 HOURS', price: '$15', tag: 'POPULAR' },
  { id: '8h', label: '8 HOURS', price: '$50', tag: 'BEST VALUE' },
] as const;

export default function PaymentModal() {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (tier: string) => {
    setLoading(tier);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error('Checkout failed:', e);
      setLoading(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <h2 style={{
        fontFamily: 'Unbounded, sans-serif', fontSize: 'clamp(1.4rem, 4vw, 2rem)',
        fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '8px',
        background: 'linear-gradient(135deg, #e8e8e8 0%, #b8b8b8 25%, #e0e0e0 50%, #a0a0a0 75%, #d0d0d0 100%)',
        backgroundSize: '200% 200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text', animation: 'chromeShift 3s ease infinite',
      }}>
        GET A TIME PASS
      </h2>
      <p style={{
        color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: '40px',
        fontFamily: 'Space Grotesk, sans-serif', textAlign: 'center',
      }}>
        Unlimited mockup generation for the duration of your pass
      </p>

      <div style={{
        display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center',
        maxWidth: '720px', width: '100%',
      }}>
        {TIERS.map(tier => (
          <div key={tier.id} style={{
            flex: '1 1 200px', maxWidth: '220px', position: 'relative',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px', padding: '32px 24px', textAlign: 'center',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            transition: 'border-color 0.2s, transform 0.2s',
            cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            onClick={() => !loading && handlePurchase(tier.id)}
          >
            {tier.tag && (
              <div style={{
                position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #e8e8e8 0%, #a0a0a0 100%)',
                color: '#000', fontSize: '0.6rem', fontWeight: 700, padding: '3px 10px',
                borderRadius: '20px', fontFamily: 'Unbounded, sans-serif', letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}>
                {tier.tag}
              </div>
            )}

            <div style={{
              fontFamily: 'Unbounded, sans-serif', fontSize: '1rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.9)', marginBottom: '8px', letterSpacing: '0.02em',
            }}>
              {tier.label}
            </div>

            <div style={{
              fontFamily: 'Unbounded, sans-serif', fontSize: '2rem', fontWeight: 800,
              background: 'linear-gradient(135deg, #e8e8e8 0%, #b8b8b8 50%, #e0e0e0 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              marginBottom: '20px',
            }}>
              {tier.price}
            </div>

            <button
              disabled={!!loading}
              style={{
                width: '100%', padding: '10px 0', border: 'none', borderRadius: '8px',
                fontFamily: 'Unbounded, sans-serif', fontSize: '0.7rem', fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer', letterSpacing: '0.05em',
                color: '#000',
                background: 'linear-gradient(135deg, #e8e8e8 0%, #b8b8b8 25%, #e0e0e0 50%, #a0a0a0 75%, #d0d0d0 100%)',
                backgroundSize: '200% 200%',
                animation: 'chromeShift 3s ease infinite',
                opacity: loading && loading !== tier.id ? 0.4 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {loading === tier.id ? 'LOADING...' : 'BUY PASS'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
