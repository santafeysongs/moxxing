'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Step = 'upload' | 'generating' | 'results' | 'deck';

interface MockupImage {
  id: string;
  base64: string;
  refIndex: number;
  status: 'keep' | 'rerun' | 'pending';
}

export default function MockUpPage() {
  const [step, setStep] = useState<Step>('upload');
  const [mode, setMode] = useState<'scene' | 'wardrobe'>('scene');
  const [projectName, setProjectName] = useState('');
  const [artistPhotos, setArtistPhotos] = useState<File[]>([]);
  const [referencePhotos, setReferencePhotos] = useState<File[]>([]);
  const [pinterestUrl, setPinterestUrl] = useState('');
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingDeck, setGeneratingDeck] = useState(false);
  const [genPhase, setGenPhase] = useState<'scraping' | 'generating'>('generating');
  const [deckSlides, setDeckSlides] = useState<string[]>([]);
  const [deckId, setDeckId] = useState('');
  const [rerunningIds, setRerunningIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const scrapedRefsRef = useRef<File[]>([]);

  const isHeic = (f: File) => /\.heic$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif';
  const thumbUrl = (f: File) => isHeic(f) ? null : URL.createObjectURL(f);
  const artistThumbs = useMemo(() => artistPhotos.map(f => thumbUrl(f)), [artistPhotos]);
  const refThumbs = useMemo(() => referencePhotos.map(f => thumbUrl(f)), [referencePhotos]);

  const handleArtistUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setArtistPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
  }, []);

  const handleRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setReferencePhotos(prev => [...prev, ...Array.from(e.target.files!)]);
  }, []);

  const generate = async () => {
    if (artistPhotos.length === 0) return;
    setStep('generating');
    setGenerating(true);
    setGenPhase('generating');

    let refs = referencePhotos;

    // If no uploaded refs but has pinterest URL, scrape first
    if (refs.length === 0 && pinterestUrl.trim()) {
      setGenPhase('scraping');
      try {
        const scrapeRes = await fetch(`${API}/api/scrape-pinterest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pinterestUrl }),
        });
        const scrapeData = await scrapeRes.json();
        if (scrapeData.images?.length) {
          const newFiles: File[] = [];
          for (const img of scrapeData.images) {
            const byteString = atob(img.base64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: 'image/jpeg' });
            newFiles.push(new File([blob], `pinterest-${newFiles.length}.jpg`, { type: 'image/jpeg' }));
          }
          refs = newFiles;
          scrapedRefsRef.current = newFiles;
        }
      } catch (e) {
        console.error('Pinterest scrape failed:', e);
        setGenerating(false);
        setStep('upload');
        return;
      }
    }

    if (refs.length === 0) { setGenerating(false); setStep('upload'); return; }

    setGenPhase('generating');
    const newSessionId = `mockup-${Date.now()}`;
    setSessionId(newSessionId);

    const formData = new FormData();
    artistPhotos.forEach(f => formData.append('artist_photos', f));
    refs.forEach(f => formData.append('reference_photos', f));
    formData.append('count', '30');
    formData.append('mode', mode);
    formData.append('session_id', newSessionId);

    try {
      const res = await fetch(`${API}/api/mockup`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.sessionId) setSessionId(data.sessionId);

      if (data.images?.length) {
        setMockups(data.images.map((img: any, i: number) => ({
          id: img.id,
          base64: img.base64,
          refIndex: img.refIndex ?? i,
          status: 'keep' as const,
        })));
        setStep('results');
      } else {
        setStep('upload');
      }
    } catch (e) {
      console.error('Generation failed:', e);
      setStep('upload');
    }
    setGenerating(false);
  };

  const rerunSingle = async (mockupId: string) => {
    const allRefs = referencePhotos.length > 0 ? referencePhotos : scrapedRefsRef.current;
    if (allRefs.length === 0) return;
    setRerunningIds(prev => new Set(prev).add(mockupId));
    try {
      const randomIdx = Math.floor(Math.random() * allRefs.length);
      const randomRef = allRefs[randomIdx];
      const formData = new FormData();
      artistPhotos.forEach(f => formData.append('artist_photos', f));
      formData.append('reference_photo', randomRef);
      formData.append('mode', mode);
      formData.append('session_id', sessionId);
      const res = await fetch(`${API}/api/mockup/rerun-single`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.image) {
        setMockups(prev => prev.map(m =>
          m.id === mockupId ? { ...m, id: data.image.id, base64: data.image.base64, refIndex: randomIdx, status: 'keep' } : m
        ));
      }
    } catch (e) { console.error('Rerun failed:', e); }
    finally { setRerunningIds(prev => { const next = new Set(prev); next.delete(mockupId); return next; }); }
  };

  const rerunAll = async () => {
    const allRefs = referencePhotos.length > 0 ? referencePhotos : scrapedRefsRef.current;
    if (allRefs.length === 0) return;
    setGenerating(true);
    setStep('generating');
    setGenPhase('generating');
    const formData = new FormData();
    artistPhotos.forEach(f => formData.append('artist_photos', f));
    allRefs.forEach(f => formData.append('reference_photos', f));
    formData.append('count', '30');
    formData.append('mode', mode);
    formData.append('session_id', sessionId);
    try {
      const res = await fetch(`${API}/api/mockup`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.images?.length) {
        setMockups(data.images.map((img: any, i: number) => ({
          id: img.id, base64: img.base64, refIndex: img.refIndex ?? i, status: 'keep' as const,
        })));
        setStep('results');
      } else { setStep('results'); }
    } catch (e) { console.error('Rerun all failed:', e); setStep('results'); }
    setGenerating(false);
  };

  const generateDeckFromMockups = async () => {
    setGeneratingDeck(true);
    setStep('generating');
    setGenPhase('generating');
    try {
      const res = await fetch(`${API}/api/mockup/deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: mockups.map(m => ({ id: m.id, base64: m.base64 })),
          sessionId,
          mode,
        }),
      });
      const data = await res.json();
      if (data.slides) {
        setDeckSlides(data.slides);
        if (data.deckId) setDeckId(data.deckId);
        setStep('deck');
      } else { setStep('results'); }
    } catch (e) { console.error('Deck gen failed:', e); setStep('results'); }
    setGeneratingDeck(false);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    mockups.forEach((m, i) => {
      zip.file(`mockup-${String(i + 1).padStart(2, '0')}.png`, m.base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${projectName || 'mockups'}.zip`);
  };

  const downloadSingle = (m: MockupImage, idx: number) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${m.base64}`;
    link.download = `mockup-${String(idx + 1).padStart(2, '0')}.png`;
    link.click();
  };

  const canGenerate = artistPhotos.length > 0 && (referencePhotos.length > 0 || pinterestUrl.trim());

  // ── GENERATING ──
  if (step === 'generating') {
    return (
      <div style={{ background: '#000', minHeight: '100vh', position: 'relative' }}>
        <video autoPlay loop muted playsInline src="/0227.mov" style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          zIndex: 0, opacity: 0.3,
        }} />
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
        <style>{`@keyframes slide { 0% { transform: translateX(-200%); } 100% { transform: translateX(500%); } }`}</style>
      </div>
    );
  }

  // ── UPLOAD ──
  if (step === 'upload') {
    const labelStyle: React.CSSProperties = {
      display: 'block', fontFamily: 'var(--font-unbounded)', fontSize: '0.8rem',
      fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em',
      color: '#fff', marginBottom: '14px',
    };
    const inputCss: React.CSSProperties = {
      width: '100%', fontSize: '1.3rem', padding: '0 0 12px',
      border: 'none', borderBottom: '2px solid rgba(255,255,255,0.4)',
      background: 'transparent', outline: 'none', color: '#fff',
      fontFamily: 'var(--font-body)',
    };
    const uploadBox = (hasFiles: boolean): React.CSSProperties => ({
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: hasFiles ? '1px solid rgba(255,255,255,0.15)' : '2px dashed rgba(255,255,255,0.4)',
      borderRadius: '8px', padding: hasFiles ? '16px' : '48px',
      textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s',
    });
    const thumbDelStyle: React.CSSProperties = {
      position: 'absolute', top: '-4px', right: '-4px', width: '18px', height: '18px',
      borderRadius: '50%', background: 'rgba(255,255,255,0.9)', color: '#000', border: 'none', cursor: 'pointer',
      fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    };

    return (
      <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
        <style>{`
          @keyframes blurReveal {
            from { filter: blur(24px); opacity: 0; transform: scale(1.05); }
            to { filter: blur(0); opacity: 1; transform: scale(1); }
          }
          @keyframes pulseGlow {
            0%, 100% { text-shadow: 0 0 80px rgba(255,255,255,0.08); }
            50% { text-shadow: 0 0 120px rgba(255,255,255,0.15); }
          }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .mf input { background: transparent !important; color: #fff !important; border: none !important; border-radius: 0 !important; padding: 0 0 12px !important; border-bottom: 2px solid rgba(255,255,255,0.4) !important; }
          .mf input::placeholder { color: rgba(255,255,255,0.35) !important; }
          .mf input:focus { box-shadow: none !important; border-color: rgba(255,255,255,0.6) !important; }
          .chrome-btn {
            background: linear-gradient(135deg, #e8e8e8 0%, #b8b8b8 25%, #e0e0e0 50%, #a0a0a0 75%, #d0d0d0 100%) !important;
            background-size: 200% 200% !important;
            animation: chromeShift 3s ease infinite !important;
          }
          @keyframes chromeShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .chrome-btn:hover { box-shadow: 0 0 30px rgba(255,255,255,0.15), 0 0 60px rgba(255,255,255,0.05) !important; }
        `}</style>

        {/* Video background */}
        <video autoPlay loop muted playsInline src="/0227.mov" style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          zIndex: 0, opacity: 0.5,
        }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />

        {/* ── HERO: Title + Mode Toggle (above fold) ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          height: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-unbounded)',
            fontSize: 'clamp(5rem, 18vw, 14rem)',
            fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '-0.03em', lineHeight: 0.85,
            textAlign: 'center', color: '#fff',
            animation: 'blurReveal 1.5s ease-out forwards, pulseGlow 4s ease-in-out 1.5s infinite',
            opacity: 0, mixBlendMode: 'difference',
            cursor: 'default', userSelect: 'none',
          }}>
            MOXX<br/>UP
          </h1>

          {/* Mode toggle at bottom of hero */}
          <div style={{
            position: 'absolute', bottom: '48px',
            display: 'flex', gap: '4px',
            background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '4px',
            animation: 'fadeIn 1s ease-out 1.2s forwards', opacity: 0,
          }}>
            {(['scene', 'wardrobe'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '14px 36px', fontSize: '0.75rem', fontWeight: 800,
                fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.15em',
                background: mode === m ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none', borderRadius: '5px', cursor: 'pointer', transition: 'all 0.2s',
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* ── FORM (below fold, scrollable) ── */}
        <div className="mf" style={{
          position: 'relative', zIndex: 1,
          padding: '80px 48px 160px',
        }}>
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>

            {/* Project */}
            <div style={{ marginBottom: '48px' }}>
              <label style={labelStyle}>Project</label>
              <input
                placeholder="Artist or project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                style={inputCss}
              />
            </div>

            {/* Subject Photos */}
            <div style={{ marginBottom: '48px' }}>
              <label style={labelStyle}>Subject</label>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginBottom: '14px', lineHeight: 1.5 }}>
                Upload photos — multiple angles help with consistency
              </p>
              <div
                onClick={(e) => { if ((e.target as HTMLElement).closest('.thumb-del')) return; document.getElementById('artist-upload')?.click(); }}
                style={uploadBox(artistPhotos.length > 0)}
              >
                <input id="artist-upload" type="file" accept="image/*,.heic,.heif" multiple onChange={handleArtistUpload} style={{ display: 'none' }} />
                {artistPhotos.length === 0
                  ? <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Click to upload photos</span>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {artistThumbs.map((url, i) => (
                        <div key={i} style={{ position: 'relative', width: '72px', height: '90px' }}>
                          {url
                            ? <img src={url} style={{ width: '72px', height: '90px', objectFit: 'cover', borderRadius: '4px' }} />
                            : <div style={{ width: '72px', height: '90px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>HEIC</div>
                          }
                          <button className="thumb-del" onClick={(e) => { e.stopPropagation(); setArtistPhotos(prev => prev.filter((_, j) => j !== i)); }} style={thumbDelStyle}>×</button>
                        </div>
                      ))}
                      <div style={{ width: '72px', height: '90px', border: '2px dashed rgba(255,255,255,0.3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>+</div>
                    </div>
                }
              </div>
            </div>

            {/* References */}
            <div style={{ marginBottom: '48px' }}>
              <label style={labelStyle}>{mode === 'scene' ? 'References' : 'Wardrobe'}</label>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginBottom: '14px', lineHeight: 1.5 }}>
                {mode === 'scene' ? 'Scenes, settings, and environments' : 'Outfits, looks, and styling references'}
              </p>
              <div
                onClick={(e) => { if ((e.target as HTMLElement).closest('.thumb-del')) return; document.getElementById('ref-upload')?.click(); }}
                style={uploadBox(referencePhotos.length > 0)}
              >
                <input id="ref-upload" type="file" accept="image/*,.heic,.heif" multiple onChange={handleRefUpload} style={{ display: 'none' }} />
                {referencePhotos.length === 0
                  ? <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Click to upload references</span>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {refThumbs.map((url, i) => (
                        <div key={i} style={{ position: 'relative', width: '72px', height: '90px' }}>
                          {url
                            ? <img src={url} style={{ width: '72px', height: '90px', objectFit: 'cover', borderRadius: '4px' }} />
                            : <div style={{ width: '72px', height: '90px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>HEIC</div>
                          }
                          <button className="thumb-del" onClick={(e) => { e.stopPropagation(); setReferencePhotos(prev => prev.filter((_, j) => j !== i)); }} style={thumbDelStyle}>×</button>
                        </div>
                      ))}
                      <div style={{ width: '72px', height: '90px', border: '2px dashed rgba(255,255,255,0.3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>+</div>
                    </div>
                }
              </div>
            </div>

            {/* Pinterest */}
            <div style={{ marginBottom: '64px' }}>
              <label style={labelStyle}>Pinterest</label>
              <input
                placeholder="Paste a board URL"
                value={pinterestUrl}
                onChange={(e) => setPinterestUrl(e.target.value)}
                style={inputCss}
              />
            </div>

            {/* Generate */}
            <button
              onClick={generate}
              disabled={!canGenerate}
              className={canGenerate ? 'chrome-btn' : ''}
              style={{
                width: '100%', padding: '18px', fontSize: '0.65rem', fontWeight: 700,
                fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.2em',
                background: canGenerate ? undefined : 'rgba(255,255,255,0.06)',
                color: canGenerate ? '#000' : 'rgba(255,255,255,0.2)',
                border: canGenerate ? 'none' : '2px solid rgba(255,255,255,0.1)',
                borderRadius: '4px', cursor: canGenerate ? 'pointer' : 'default',
                transition: 'all 0.3s',
              }}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DECK PREVIEW ──
  if (step === 'deck') {
    return (
      <div style={{ minHeight: 'calc(100vh - 61px)', background: '#f5f5f5', color: '#000', padding: '24px' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '24px', position: 'sticky', top: '61px', zIndex: 50,
          background: 'rgba(245,245,245,0.95)', backdropFilter: 'blur(12px)',
          padding: '12px 0',
        }}>
          <button onClick={() => setStep('results')} style={{
            padding: '10px 16px', fontSize: '0.65rem', fontWeight: 700,
            fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
            background: 'none', color: '#000', border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: '3px', cursor: 'pointer',
          }}>
            ← Back
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={async () => {
              const res = await fetch(`${API}/api/mockup/deck/${deckId}/pdf`);
              if (!res.ok) { alert('PDF not found — generate a new deck.'); return; }
              saveAs(await res.blob(), `${projectName || 'mockup-deck'}.pdf`);
            }} style={{
              padding: '10px 20px', fontSize: '0.65rem', fontWeight: 700,
              fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
              background: '#000', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer',
            }}>
              PDF
            </button>
            <button onClick={async () => {
              const res = await fetch(`${API}/api/mockup/deck/${deckId}/pptx`);
              if (!res.ok) { alert('PPTX not found — generate a new deck.'); return; }
              saveAs(await res.blob(), `${projectName || 'mockup-deck'}.pptx`);
            }} style={{
              padding: '10px 20px', fontSize: '0.65rem', fontWeight: 700,
              fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
              background: '#000', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer',
            }}>
              PPTX
            </button>
          </div>
        </div>
        {/* Slides */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
          {deckSlides.map((slideImg, i) => (
            <div key={i} style={{
              width: '100%', maxWidth: '1100px',
              boxShadow: '0 1px 8px rgba(0,0,0,0.08)', overflow: 'hidden',
            }}>
              <img src={`data:image/jpeg;base64,${slideImg}`} style={{ width: '100%', display: 'block' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  return (
    <div style={{ background: '#000', minHeight: 'calc(100vh - 61px)' }}>
      <style>{`
        @keyframes mockup-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Floating top bar */}
      <div style={{
        position: 'sticky', top: '61px', zIndex: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          fontFamily: 'var(--font-unbounded)', fontSize: '0.6rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.35)',
        }}>
          {projectName || 'Mock Up'}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'Download', onClick: downloadAll },
            { label: 'Rerun', onClick: rerunAll },
            { label: 'Deck', onClick: generateDeckFromMockups },
          ].map(({ label, onClick }) => (
            <button key={label} onClick={onClick} style={{
              padding: '8px 14px', fontSize: '0.6rem', fontWeight: 700,
              fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            >
              {label}
            </button>
          ))}
          <button onClick={() => { setStep('upload'); setMockups([]); }} style={{
            padding: '8px 14px', fontSize: '0.6rem', fontWeight: 700,
            fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
            background: 'none', color: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            New
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(5, mockups.length)}, 1fr)`,
        gap: '1px',
        background: '#000',
      }}>
        {mockups.map((m, idx) => (
          <div
            key={m.id}
            style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', cursor: 'pointer' }}
            onMouseEnter={() => setHoveredId(m.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <img
              src={`data:image/png;base64,${m.base64}`}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: rerunningIds.has(m.id) ? 0.2 : 1,
                transition: 'all 0.3s',
                transform: hoveredId === m.id ? 'scale(1.03)' : 'scale(1)',
              }}
            />
            {rerunningIds.has(m.id) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: 'mockup-spin 1s linear infinite' }}>
                  <path d="M1 4v4h4" /><path d="M15 12V8h-4" />
                  <path d="M13.5 5.5A6 6 0 0 0 3 4l-2 2" /><path d="M2.5 10.5A6 6 0 0 0 13 12l2-2" />
                </svg>
              </div>
            )}
            {/* Hover overlay */}
            {hoveredId === m.id && !rerunningIds.has(m.id) && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '32px 12px 12px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadSingle(m, idx); }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                    width: '32px', height: '32px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v9M4 8l4 4 4-4M2 14h12" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); rerunSingle(m.id); }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                    width: '32px', height: '32px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4v4h4" /><path d="M15 12V8h-4" />
                    <path d="M13.5 5.5A6 6 0 0 0 3 4l-2 2" /><path d="M2.5 10.5A6 6 0 0 0 13 12l2-2" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
