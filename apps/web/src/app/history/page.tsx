'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function HistoryPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/campaigns`)
      .then(r => r.json())
      .then(data => {
        setCampaigns(Array.isArray(data) ? data : data.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="theme-light" style={{
      minHeight: '100vh', padding: '80px 80px', maxWidth: '1200px', margin: '0 auto',
      fontFamily: 'var(--font-unbounded)',
    }}>
      <h2 style={{ marginBottom: '64px', fontSize: '2.8rem' }}>History</h2>

      {loading && (
        <p style={{ fontSize: '1.1rem', opacity: 0.4, fontWeight: 500 }}>Loading campaigns...</p>
      )}

      {!loading && campaigns.length === 0 && (
        <div style={{ textAlign: 'center', padding: '120px 0' }}>
          <p style={{ fontSize: '1.2rem', opacity: 0.35, fontWeight: 600, marginBottom: '32px' }}>
            No campaigns yet
          </p>
          <button
            className="btn-primary"
            onClick={() => router.push('/create')}
            style={{ fontSize: '1.1rem', fontFamily: 'var(--font-unbounded)' }}
          >
            Create Your First Campaign
          </button>
        </div>
      )}

      {!loading && campaigns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {campaigns.map((c: any) => {
            const artistNames = c.artistNames || [];
            const name = Array.isArray(artistNames) && artistNames.length > 0
              ? artistNames.join(', ')
              : c.manifesto
              ? c.manifesto.slice(0, 60) + (c.manifesto.length > 60 ? '...' : '')
              : `Campaign ${c.id?.slice(0, 8)}`;
            const status = c.status || 'unknown';
            const date = (c.createdAt || c.created_at) ? new Date(c.createdAt || c.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            }) : '';
            const manifesto = c.manifesto || '';

            return (
              <div
                key={c.id || c.campaign_id}
                onClick={() => router.push(`/campaign/${c.id || c.campaign_id}`)}
                style={{
                  padding: '28px 32px',
                  background: 'var(--surface)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--surface)';
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, textTransform: 'uppercase' }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {status === 'complete' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(`${API}/api/campaigns/${c.id || c.campaign_id}/rerun`, { method: 'POST' });
                            const data = await res.json();
                            if (data.campaign_id) router.push(`/campaign/${data.campaign_id}`);
                            else alert(data.error || 'Rerun failed');
                          } catch { alert('Rerun failed'); }
                        }}
                        style={{
                          fontSize: '0.8rem', fontWeight: 700, padding: '6px 14px',
                          border: '1px solid var(--border)', borderRadius: '4px',
                          background: 'transparent', cursor: 'pointer', color: 'var(--text)',
                          fontFamily: 'var(--font-unbounded)',
                        }}
                      >
                        ↻ Rerun
                      </button>
                    )}
                    {date && (
                      <span style={{ fontSize: '0.85rem', opacity: 0.35, fontWeight: 500 }}>{date}</span>
                    )}
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase',
                      color: status === 'complete' ? '#16a34a' : status === 'error' ? '#dc2626' : 'var(--text-muted)',
                    }}>
                      {status === 'complete' ? '● Done' : status === 'processing' ? '● Processing' : status === 'error' ? '● Error' : status}
                    </span>
                  </div>
                </div>
                {manifesto && (
                  <p style={{
                    fontSize: '0.95rem', fontWeight: 500, opacity: 0.5, lineHeight: 1.5,
                    fontFamily: 'var(--font-body)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {manifesto}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
