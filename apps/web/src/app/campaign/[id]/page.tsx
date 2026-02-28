'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ANTI_AI_SHORT = 'Shot on 35mm film. Imperfect focus. Visible grain. Real photography.';
const NO_TEXT_SHORT = 'No text, no watermarks, no typography.';

type Tab = 'deck' | 'images';

export default function CampaignPage() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('deck');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Graph removed from campaign output — The Graft is a separate product

  // Regeneration drawer state
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [rebuildingDeck, setRebuildingDeck] = useState(false);
  const [deckRebuilt, setDeckRebuilt] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenRef, setRegenRef] = useState<File | null>(null);
  const [regenRefPreview, setRegenRefPreview] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState('');

  useEffect(() => {
    if (!id) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/campaigns/${id}`);
        const data = await res.json();
        setCampaign(data);
        if (data.status === 'processing') setTimeout(poll, 2000);
      } catch (e) {
        setError('Failed to fetch campaign');
      }
    };
    poll();
  }, [id]);

  // Graph visualization fetch removed

  // Graph canvas rendering removed

  useEffect(() => {
    if (activeTab === 'deck' && campaign?.status === 'complete' && !pdfUrl) {
      fetch(`${API}/api/campaigns/${id}/deck`)
        .then(res => res.blob())
        .then(blob => setPdfUrl(URL.createObjectURL(blob)))
        .catch(() => {});
    }
  }, [activeTab, campaign?.status, id, pdfUrl]);

  if (error) return <div style={{ padding: '80px', color: '#ff4444', fontFamily: 'var(--font-unbounded)', fontSize: '1.2rem' }}>{error}</div>;
  if (!campaign) return <div style={{ padding: '80px', fontFamily: 'var(--font-unbounded)', fontSize: '1.2rem', fontWeight: 600, opacity: 0.4 }}>Loading...</div>;

  const result = campaign.result;

  // Shared styles
  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-unbounded)', fontSize: '1.1rem', fontWeight: 800,
    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '20px',
  };

  return (
    <main className="theme-light" style={{ minHeight: '100vh', fontFamily: 'var(--font-unbounded)' }}>
      {/* ── STICKY HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(247,244,239,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '18px 80px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link href="/" style={{ opacity: 0.4, fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', color: 'var(--text)' }}>
            ← Home
          </Link>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>
            Campaign
          </div>
          {campaign.status === 'processing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '140px', height: '4px', background: 'var(--surface)', borderRadius: '2px' }}>
                <div style={{
                  width: `${campaign.progress}%`, height: '100%',
                  background: 'var(--accent)', borderRadius: '2px', transition: 'width 0.5s',
                }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', opacity: 0.5, fontWeight: 600 }}>{campaign.progress}%</span>
            </div>
          )}
          {campaign.status === 'complete' && (
            <span style={{ fontSize: '0.85rem', fontWeight: 700, opacity: 0.6, color: '#16a34a' }}>● Complete</span>
          )}
          {campaign.status === 'error' && (
            <span style={{ fontSize: '0.85rem', fontWeight: 700, opacity: 0.6, color: '#dc2626' }}>● Error</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href={`${API}/api/campaigns/${id}/deck`}
            className="btn-primary"
            style={{
              display: campaign.status === 'complete' ? 'inline-block' : 'none',
              textDecoration: 'none', padding: '10px 24px', fontSize: '0.85rem',
              fontFamily: 'var(--font-unbounded)',
            }}
          >
            ↓ PDF
          </a>
          <a
            href={`${API}/api/campaigns/${id}/deck.pptx`}
            style={{
              display: campaign.status === 'complete' ? 'inline-flex' : 'none',
              alignItems: 'center',
              textDecoration: 'none', padding: '10px 24px', fontSize: '0.85rem',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-unbounded)',
            }}
          >
            ↓ Keynote / Slides
          </a>
          <button
            onClick={async () => {
              if (!confirm('Rerun this campaign from scratch? Same inputs, fresh analysis + images.')) return;
              try {
                const res = await fetch(`${API}/api/campaigns/${id}/rerun`, { method: 'POST' });
                const data = await res.json();
                if (data.campaign_id) {
                  router.push(`/campaign/${data.campaign_id}`);
                } else {
                  alert(data.error || 'Rerun failed');
                }
              } catch (e) {
                alert('Rerun failed');
              }
            }}
            style={{
              display: campaign.status === 'complete' ? 'inline-flex' : 'none',
              alignItems: 'center',
              padding: '10px 24px', fontSize: '0.85rem',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-unbounded)',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            ↻ Rerun
          </button>
          <Link
            href="/create"
            style={{
              padding: '10px 24px', fontSize: '0.85rem',
              border: '1px solid var(--border)', borderRadius: '6px',
              textDecoration: 'none', color: 'var(--text)',
              fontWeight: 700, fontFamily: 'var(--font-unbounded)',
            }}
          >
            + New
          </Link>
        </div>
      </header>

      {/* ── PROCESSING STATE ── */}
      {campaign.status === 'processing' && (
        <div style={{ textAlign: 'center', padding: '200px 80px' }}>
          <div style={{ ...sectionLabel, marginBottom: '32px', fontSize: '1.2rem' }}>
            {campaign.progress < 30 ? 'Analyzing images...' :
             campaign.progress < 70 ? 'Synthesizing creative direction...' :
             campaign.progress < 85 ? 'Generating AI images...' :
             'Building deck...'}
          </div>
          <div style={{ width: '300px', height: '5px', background: 'var(--surface)', borderRadius: '3px', margin: '0 auto' }}>
            <div style={{
              width: `${campaign.progress}%`, height: '100%',
              background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.5s',
            }} />
          </div>
          <p style={{
            marginTop: '48px', fontSize: '1rem', opacity: 0.3, maxWidth: '500px', margin: '48px auto 0',
            lineHeight: 1.8, fontWeight: 500,
          }}>
            This can take 2–5 minutes depending on images. AI image generation adds about 30–60 seconds.
          </p>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {campaign.status === 'error' && (
        <div style={{ padding: '200px 80px', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', color: '#ff4444', marginBottom: '32px', fontWeight: 600 }}>
            {campaign.error}
          </p>
          <Link href="/create" className="btn-primary" style={{ textDecoration: 'none', fontFamily: 'var(--font-unbounded)' }}>
            Try Again
          </Link>
        </div>
      )}

      {/* ── COMPLETE STATE ── */}
      {campaign.status === 'complete' && result && (
        <>
          {/* Tab navigation */}
          <nav style={{
            padding: '0 80px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', gap: '0',
          }}>
            {([
              ['deck', 'Deck Preview'],
              ['images', 'Generated Images'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '18px 28px',
                  fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-unbounded)',
                  background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer',
                  opacity: activeTab === key ? 1 : 0.35,
                  borderBottom: activeTab === key ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div style={{ padding: '56px 80px', maxWidth: '1400px', margin: '0 auto' }}>

            {/* Overview tab removed */}

            {false && (
              <>
                <section style={{ marginBottom: '72px' }}>
                  <h1 style={{
                    fontFamily: 'var(--font-unbounded)',
                    fontSize: '2.2rem', fontWeight: 500, fontStyle: 'italic',
                    lineHeight: 1.4, maxWidth: '900px',
                  }}>
                    {result.synthesis?.manifesto}
                  </h1>
                </section>

                {/* Narrative */}
                {result.synthesis?.narrative && (
                  <section style={{ marginBottom: '72px' }}>
                    <div style={sectionLabel}>Creative Direction</div>
                    <p style={{ fontSize: '1.1rem', lineHeight: 1.9, opacity: 0.7, maxWidth: '800px', fontWeight: 500 }}>
                      {result.synthesis.narrative}
                    </p>
                  </section>
                )}

                {/* Color Palette */}
                {result.synthesis?.color_system?.primary_palette && (
                  <section style={{ marginBottom: '72px' }}>
                    <div style={sectionLabel}>Color System</div>
                    <div style={{ display: 'flex', gap: '4px', height: '120px', marginBottom: '16px', borderRadius: '6px', overflow: 'hidden' }}>
                      {[...result.synthesis.color_system.primary_palette, ...(result.synthesis.color_system.accent_colors || [])].map((c: any, i: number) => (
                        <div key={i} style={{ flex: c.weight || 1, background: c.hex }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {result.synthesis.color_system.primary_palette.map((c: any, i: number) => (
                        <div key={i} style={{ flex: c.weight || 1 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', opacity: 0.35, fontWeight: 600 }}>{c.hex}</span>
                        </div>
                      ))}
                    </div>
                    {result.synthesis.color_system.color_story && (
                      <p style={{ marginTop: '20px', fontSize: '1rem', lineHeight: 1.7, opacity: 0.5, maxWidth: '700px', fontWeight: 500 }}>
                        {result.synthesis.color_system.color_story}
                      </p>
                    )}
                  </section>
                )}

                {/* Mood Profile */}
                {result.synthesis?.mood_profile && (
                  <section style={{ marginBottom: '72px' }}>
                    <div style={sectionLabel}>Mood Profile</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '28px', textTransform: 'capitalize' }}>
                      {result.synthesis.mood_profile.primary_mood}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '28px', maxWidth: '700px' }}>
                      {['energy', 'tension', 'warmth'].map(key => (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.5 }}>{key}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', opacity: 0.3, fontWeight: 600 }}>
                              {((result.synthesis.mood_profile[key] || 0) * 100).toFixed(0)}
                            </span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--surface)', borderRadius: '3px' }}>
                            <div style={{
                              width: `${(result.synthesis.mood_profile[key] || 0) * 100}%`,
                              height: '100%', background: 'var(--accent)', borderRadius: '3px',
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Generated Images Preview */}
                {campaign.generatedImages && campaign.generatedImages.length > 0 && (
                  <section style={{ marginBottom: '72px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div style={sectionLabel}>AI-Generated Visual World</div>
                      <button
                        onClick={() => setActiveTab('images')}
                        style={{ fontSize: '0.95rem', opacity: 0.4, fontWeight: 700, fontFamily: 'var(--font-unbounded)' }}
                      >
                        View all →
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {campaign.generatedImages.slice(0, 3).map((img: any, i: number) => (
                        <div key={i} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', aspectRatio: '4/3' }}>
                          <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={img.category}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '12px 16px',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                            fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff',
                          }}>
                            {img.category.replace(/-/g, ' ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Touchpoints */}
                {result.touchpoints && (
                  <section style={{ marginBottom: '72px' }}>
                    <div style={sectionLabel}>Creative Direction by Touchpoint</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {Object.entries(result.touchpoints).filter(([_, v]) => v).map(([key, value]) => (
                        <div key={key} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.5, marginBottom: '12px' }}>
                            {key.replace(/_/g, ' ')}
                          </div>
                          <div style={{ fontSize: '1rem', lineHeight: 1.7, opacity: 0.7, fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                            {value as string}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ── TAB: DECK PREVIEW ── */}
            {activeTab === 'deck' && (
              <div>
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    style={{
                      width: '100%', height: 'calc(100vh - 200px)',
                      border: 'none', borderRadius: '6px',
                      background: '#111',
                    }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '120px 0', opacity: 0.4, fontSize: '1.1rem', fontWeight: 600 }}>
                    Loading PDF preview...
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: GENERATED IMAGES (with regeneration) ── */}
            {activeTab === 'images' && (
              <div style={{ display: 'flex', gap: '0' }}>
                {/* Image grid */}
                <div style={{ flex: 1, transition: 'margin-right 0.3s', marginRight: regenIndex !== null ? '420px' : '0' }}>
                  {campaign.generatedImages && campaign.generatedImages.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {campaign.generatedImages.map((img: any, i: number) => (
                        <div key={i} style={{
                          position: 'relative', borderRadius: '6px', overflow: 'hidden',
                          outline: regenIndex === i ? '3px solid var(--accent)' : 'none',
                          outlineOffset: '-3px',
                        }}>
                          <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={img.category}
                            style={{
                              width: '100%', display: 'block',
                              opacity: regenLoading && regenIndex === i ? 0.4 : 1,
                              transition: 'opacity 0.3s',
                            }}
                          />
                          {regenLoading && regenIndex === i && (
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(0,0,0,0.3)',
                            }}>
                              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-unbounded)' }}>
                                Generating...
                              </div>
                            </div>
                          )}
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '20px 24px',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                          }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>
                              {img.category.replace(/-/g, ' ')}
                              {img.generation_history?.length > 0 && (
                                <span style={{ marginLeft: '8px', opacity: 0.5, fontSize: '0.8rem' }}>
                                  v{img.generation_history.length + 1}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRegenIndex(i);
                                setRegenPrompt('');
                                setRegenRef(null);
                                setRegenRefPreview(null);
                                setRegenError('');
                              }}
                              title="Regenerate this image"
                              style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                border: 'none', background: 'rgba(255,255,255,0.15)',
                                color: '#e8dcc8', cursor: 'pointer', fontSize: '1.1rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: 0.6, transition: 'opacity 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                            >
                              ↻
                            </button>
                          </div>
                        </div>
                      ))}
                    {/* Refresh Deck button */}
                    <div style={{ gridColumn: '1 / -1', padding: '40px 0', textAlign: 'center' }}>
                      <button
                        disabled={rebuildingDeck}
                        onClick={async () => {
                          setRebuildingDeck(true);
                          setDeckRebuilt(false);
                          try {
                            const res = await fetch(`${API}/api/campaigns/${id}/rebuild-deck`, { method: 'POST' });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            setDeckRebuilt(true);
                            setPdfUrl(null); // force PDF reload on deck tab
                            setTimeout(() => setDeckRebuilt(false), 4000);
                          } catch (e: any) {
                            alert('Deck rebuild failed: ' + (e.message || 'Unknown error'));
                          } finally {
                            setRebuildingDeck(false);
                          }
                        }}
                        className="btn-primary"
                        style={{
                          padding: '16px 40px', fontSize: '1rem',
                          fontFamily: 'var(--font-unbounded)', fontWeight: 700,
                          opacity: rebuildingDeck ? 0.5 : 1,
                        }}
                      >
                        {rebuildingDeck ? 'Rebuilding Deck...' : deckRebuilt ? '✓ Deck Updated' : '↻ Refresh Deck'}
                      </button>
                      <p style={{ marginTop: '12px', fontSize: '0.85rem', opacity: 0.35, fontWeight: 500 }}>
                        Regenerate images above, then refresh the deck to include your changes
                      </p>
                    </div>
                  </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '120px 0', opacity: 0.4, fontSize: '1.1rem', fontWeight: 600 }}>
                      No images were generated for this campaign.
                    </div>
                  )}
                </div>

                {/* Regeneration drawer */}
                {regenIndex !== null && campaign.generatedImages?.[regenIndex] && (
                  <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
                    background: '#faf7f2', borderLeft: '1px solid var(--border)',
                    zIndex: 30, overflowY: 'auto',
                    boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
                    padding: '24px',
                    display: 'flex', flexDirection: 'column', gap: '20px',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-unbounded)', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.5 }}>
                        Regenerate
                      </div>
                      <button
                        onClick={() => setRegenIndex(null)}
                        style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', opacity: 0.4, padding: '4px 8px' }}
                      >
                        ×
                      </button>
                    </div>

                    {/* Current image preview */}
                    <div style={{ borderRadius: '6px', overflow: 'hidden' }}>
                      <img
                        src={`data:image/png;base64,${campaign.generatedImages[regenIndex].base64}`}
                        alt=""
                        style={{ width: '100%', display: 'block' }}
                      />
                    </div>

                    <div style={{ fontFamily: 'var(--font-unbounded)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                      {campaign.generatedImages[regenIndex].category.replace(/-/g, ' ')}
                    </div>

                    {/* Direction input */}
                    <div>
                      <label style={{ fontFamily: 'var(--font-unbounded)', fontSize: '0.75rem', fontWeight: 700, opacity: 0.4, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Direction (optional)
                      </label>
                      <textarea
                        value={regenPrompt}
                        onChange={e => setRegenPrompt(e.target.value)}
                        placeholder="e.g. more shadow, wider shot, different angle..."
                        rows={3}
                        style={{
                          width: '100%', padding: '12px', borderRadius: '6px',
                          border: '1px solid var(--border)', background: '#fff',
                          fontSize: '0.85rem', fontFamily: 'var(--font-body)', lineHeight: 1.6,
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    {/* Reference image upload */}
                    <div>
                      <label style={{ fontFamily: 'var(--font-unbounded)', fontSize: '0.75rem', fontWeight: 700, opacity: 0.4, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        New Reference Image
                      </label>
                      {regenRefPreview ? (
                        <div style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                          <img src={regenRefPreview} alt="" style={{ width: '100%', display: 'block', maxHeight: '160px', objectFit: 'cover' }} />
                          <button
                            onClick={() => { setRegenRef(null); setRegenRefPreview(null); }}
                            style={{
                              position: 'absolute', top: '8px', right: '8px',
                              width: '24px', height: '24px', borderRadius: '50%',
                              background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                              cursor: 'pointer', fontSize: '0.8rem',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label style={{
                          display: 'block', padding: '24px', borderRadius: '6px',
                          border: '2px dashed var(--border)', textAlign: 'center',
                          cursor: 'pointer', fontSize: '0.85rem', opacity: 0.4, fontWeight: 600,
                        }}>
                          Upload reference
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setRegenRef(file);
                                setRegenRefPreview(URL.createObjectURL(file));
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {regenError && (
                      <div style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{regenError}</div>
                    )}

                    {/* Single generate button */}
                    <button
                      disabled={regenLoading}
                      onClick={async () => {
                        setRegenLoading(true);
                        setRegenError('');
                        try {
                          const formData = new FormData();
                          // Build a clean short prompt — just direction + reference
                          const direction = regenPrompt.trim() || 'Same style as the reference. Match lighting and color grade.';
                          formData.append('prompt', `${direction} ${ANTI_AI_SHORT} ${NO_TEXT_SHORT}`);
                          formData.append('mode', regenRef ? 'reference_driven' : 'prompt_edit');
                          if (regenRef) formData.append('reference_image', regenRef);
                          const res = await fetch(`${API}/api/campaigns/${id}/regenerate-image/${regenIndex}`, {
                            method: 'POST', body: formData,
                          });
                          const data = await res.json();
                          if (data.error) throw new Error(data.error);
                          setCampaign((prev: any) => {
                            const updated = { ...prev };
                            updated.generatedImages = [...updated.generatedImages];
                            updated.generatedImages[regenIndex!] = {
                              ...updated.generatedImages[regenIndex!],
                              base64: data.base64,
                              prompt: direction,
                              generation_history: [
                                ...(updated.generatedImages[regenIndex!].generation_history || []),
                                { base64: prev.generatedImages[regenIndex!].base64, timestamp: new Date().toISOString() },
                              ],
                            };
                            return updated;
                          });
                        } catch (e: any) {
                          setRegenError(e.message || 'Regeneration failed');
                        } finally {
                          setRegenLoading(false);
                        }
                      }}
                      className="btn-primary"
                      style={{
                        width: '100%', padding: '14px 20px', fontSize: '0.9rem',
                        fontFamily: 'var(--font-unbounded)', fontWeight: 700,
                        opacity: regenLoading ? 0.5 : 1,
                      }}
                    >
                      {regenLoading ? 'Generating...' : 'Regenerate'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Graph tab removed — The Graft is a separate product */}
          </div>
        </>
      )}
    </main>
  );
}
