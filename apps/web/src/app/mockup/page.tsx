'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import './mockup.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import UploadForm from './components/UploadForm';
import GeneratingView from './components/GeneratingView';
import ResultsGrid from './components/ResultsGrid';
import DeckPreview from './components/DeckPreview';
import PaymentModal from './components/PaymentModal';
import { Step, MockupImage, API } from './components/types';

export default function MockUpPage() {
  const [step, setStep] = useState<Step>('upload');
  const [mode, setMode] = useState<'scene' | 'wardrobe' | 'batch'>('scene');
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
  const [batchPhotos, setBatchPhotos] = useState<File[]>([]);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [generatingVideoIds, setGeneratingVideoIds] = useState<Set<string>>(new Set());
  const [videoResults, setVideoResults] = useState<Map<string, string>>(new Map());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Payment state
  const [showPayment, setShowPayment] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  // Check for Stripe session_id on mount + restore from localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get('session_id');
    const storedSession = localStorage.getItem('moxxing_session');
    const sid = stripeSessionId || storedSession;

    if (stripeSessionId) {
      // Clean URL
      window.history.replaceState({}, '', '/mockup');
    }

    if (sid) {
      validatePaymentSession(sid);
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000));
      setRemainingMinutes(remaining);
      if (remaining <= 0) {
        setShowPayment(true);
        setPaymentSessionId(null);
        localStorage.removeItem('moxxing_session');
      }
    };
    tick();
    const interval = setInterval(tick, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function validatePaymentSession(sid: string) {
    try {
      const res = await fetch(`${API}/api/session/${sid}`);
      const data = await res.json();
      if (data.valid) {
        setPaymentSessionId(sid);
        setRemainingMinutes(data.remainingMinutes);
        setExpiresAt(new Date(data.expiresAt));
        setShowPayment(false);
        localStorage.setItem('moxxing_session', sid);
      } else {
        localStorage.removeItem('moxxing_session');
        setPaymentSessionId(null);
      }
    } catch {
      // Silent fail — will prompt payment when needed
    }
  }

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioStartTime, setAudioStartTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrapedRefsRef = useRef<File[]>([]);

  const clearAudio = useCallback(() => {
    setAudioFile(null);
    setAudioStartTime(0);
    setAudioDuration(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, [audioUrl]);

  // ── API helpers with error handling ──

  async function safeFetch(url: string, opts?: RequestInit): Promise<Response> {
    // Inject X-Session-Id header
    const headers = new Headers(opts?.headers);
    const sid = paymentSessionId || localStorage.getItem('moxxing_session');
    if (sid) headers.set('X-Session-Id', sid);
    const res = await fetch(url, { ...opts, headers });

    if (res.status === 402) {
      const body = await res.json().catch(() => ({ needsPayment: true }));
      if (body.needsPayment) {
        setShowPayment(true);
        throw new Error('__payment_required__');
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res;
  }

  function setErrorIfNotPayment(msg: string) {
    if (msg === '__payment_required__') return;
    setError(msg);
  }

  // ── Generate ──

  const generate = async () => {
    setError(null);

    if (mode === 'batch') {
      if (batchPhotos.length === 0) return;
      if (!batchPrompt.trim() && referencePhotos.length === 0) return;
      setStep('generating');
      setGenerating(true);
      setGenPhase('generating');

      const newSessionId = `batch-${Date.now()}`;
      setSessionId(newSessionId);

      const formData = new FormData();
      batchPhotos.forEach(f => formData.append('photos', f));
      referencePhotos.forEach(f => formData.append('reference_photos', f));
      formData.append('prompt', batchPrompt);
      formData.append('session_id', newSessionId);

      try {
        const res = await safeFetch(`${API}/api/mockup/batch`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.sessionId) setSessionId(data.sessionId);
        if (data.images?.length) {
          setMockups(data.images.map((img: any, i: number) => ({
            id: img.id, base64: img.base64, refIndex: img.photoIndex ?? i, status: 'keep' as const,
          })));
          setStep('results');
        } else { setStep('upload'); }
      } catch (e: any) {
        console.error('Batch generation failed:', e);
        setErrorIfNotPayment(e.message || 'Generation failed — please try again');
        setStep('upload');
      }
      setGenerating(false);
      return;
    }

    if (artistPhotos.length === 0) return;
    setStep('generating');
    setGenerating(true);
    setGenPhase('generating');

    let refs = referencePhotos;

    if (refs.length === 0 && pinterestUrl.trim()) {
      setGenPhase('scraping');
      try {
        const scrapeRes = await safeFetch(`${API}/api/scrape-pinterest`, {
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
      } catch (e: any) {
        console.error('Pinterest scrape failed:', e);
        setErrorIfNotPayment(e.message || 'Pinterest scrape failed — check the URL and try again');
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
    formData.append('count', '20');
    formData.append('mode', mode);
    formData.append('session_id', newSessionId);

    try {
      const res = await safeFetch(`${API}/api/mockup`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.images?.length) {
        setMockups(data.images.map((img: any, i: number) => ({
          id: img.id, base64: img.base64, refIndex: img.refIndex ?? i, status: 'keep' as const,
        })));
        setStep('results');
      } else { setStep('upload'); }
    } catch (e: any) {
      console.error('Generation failed:', e);
      setErrorIfNotPayment(e.message || 'Generation failed — please try again');
      setStep('upload');
    }
    setGenerating(false);
  };

  // ── Rerun ──

  const rerunSingle = async (mockupId: string) => {
    if (mode === 'batch') {
      const mockup = mockups.find(m => m.id === mockupId);
      if (!mockup) return;
      const sourcePhoto = batchPhotos[mockup.refIndex];
      if (!sourcePhoto) return;
      setRerunningIds(prev => new Set(prev).add(mockupId));
      try {
        const formData = new FormData();
        formData.append('photos', sourcePhoto);
        referencePhotos.forEach(f => formData.append('reference_photos', f));
        formData.append('prompt', batchPrompt);
        const res = await safeFetch(`${API}/api/mockup/batch/rerun-single`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.image) {
          setMockups(prev => prev.map(m =>
            m.id === mockupId ? { ...m, id: data.image.id, base64: data.image.base64, status: 'keep' } : m
          ));
        }
      } catch (e) { console.error('Rerun failed:', e); }
      finally { setRerunningIds(prev => { const next = new Set(prev); next.delete(mockupId); return next; }); }
      return;
    }

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
      const res = await safeFetch(`${API}/api/mockup/rerun-single`, { method: 'POST', body: formData });
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
    setError(null);

    if (mode === 'batch') {
      setGenerating(true);
      setStep('generating');
      setGenPhase('generating');
      const formData = new FormData();
      batchPhotos.forEach(f => formData.append('photos', f));
      referencePhotos.forEach(f => formData.append('reference_photos', f));
      formData.append('prompt', batchPrompt);
      formData.append('session_id', sessionId);
      try {
        const res = await safeFetch(`${API}/api/mockup/batch`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.images?.length) {
          setMockups(data.images.map((img: any, i: number) => ({
            id: img.id, base64: img.base64, refIndex: img.photoIndex ?? i, status: 'keep' as const,
          })));
        }
        setStep('results');
      } catch (e: any) {
        console.error('Rerun all failed:', e);
        setErrorIfNotPayment(e.message || 'Rerun failed');
        setStep('results');
      }
      setGenerating(false);
      return;
    }

    const allRefs = referencePhotos.length > 0 ? referencePhotos : scrapedRefsRef.current;
    if (allRefs.length === 0) return;
    setGenerating(true);
    setStep('generating');
    setGenPhase('generating');
    const formData = new FormData();
    artistPhotos.forEach(f => formData.append('artist_photos', f));
    allRefs.forEach(f => formData.append('reference_photos', f));
    formData.append('count', '20');
    formData.append('mode', mode);
    formData.append('session_id', sessionId);
    try {
      const res = await safeFetch(`${API}/api/mockup`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.images?.length) {
        setMockups(data.images.map((img: any, i: number) => ({
          id: img.id, base64: img.base64, refIndex: img.refIndex ?? i, status: 'keep' as const,
        })));
      }
      setStep('results');
    } catch (e: any) {
      console.error('Rerun all failed:', e);
      setErrorIfNotPayment(e.message || 'Rerun failed');
      setStep('results');
    }
    setGenerating(false);
  };

  // ── Deck ──

  const generateDeckFromMockups = async () => {
    setError(null);
    setGeneratingDeck(true);
    setStep('generating');
    setGenPhase('generating');
    try {
      const res = await safeFetch(`${API}/api/mockup/deck`, {
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
    } catch (e: any) {
      console.error('Deck gen failed:', e);
      setErrorIfNotPayment(e.message || 'Deck generation failed');
      setStep('results');
    }
    setGeneratingDeck(false);
  };

  // ── Video ──

  const generateVideo = async (mockupId: string) => {
    const mockup = mockups.find(m => m.id === mockupId);
    if (!mockup) return;
    setGeneratingVideoIds(prev => new Set(prev).add(mockupId));
    try {
      const formData = new FormData();
      const imgBlob = await fetch(`data:image/png;base64,${mockup.base64}`).then(r => r.blob());
      formData.append('image', imgBlob, 'image.png');
      if (audioFile) {
        formData.append('audio', audioFile);
        formData.append('audioStart', String(audioStartTime));
      }

      const videoHeaders: Record<string, string> = {};
      const vidSid = paymentSessionId || localStorage.getItem('moxxing_session');
      if (vidSid) videoHeaders['X-Session-Id'] = vidSid;
      const res = await fetch(`${API}/api/mockup/video`, { method: 'POST', body: formData, headers: videoHeaders });
      if (res.status === 402) {
        setShowPayment(true);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Video generation failed:', err.error);
        alert(`Video generation failed: ${err.error?.slice(0, 100)}`);
      } else {
        const data = await res.json();
        if (data.base64) {
          setVideoResults(prev => new Map(prev).set(mockupId, data.base64));
        }
      }
    } catch (e) { console.error('Video generation failed:', e); }
    finally { setGeneratingVideoIds(prev => { const next = new Set(prev); next.delete(mockupId); return next; }); }
  };

  // ── Downloads ──

  const downloadVideo = (mockupId: string, idx: number) => {
    const videoBase64 = videoResults.get(mockupId);
    if (!videoBase64) return;
    const link = document.createElement('a');
    link.href = `data:video/mp4;base64,${videoBase64}`;
    link.download = `mockup-${String(idx + 1).padStart(2, '0')}-video.mp4`;
    link.click();
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

  // ── Derived ──

  const canGenerate = mode === 'batch'
    ? batchPhotos.length > 0 && (!!batchPrompt.trim() || referencePhotos.length > 0)
    : artistPhotos.length > 0 && (referencePhotos.length > 0 || !!pinterestUrl.trim());

  const handleNew = () => {
    setStep('upload');
    setMockups([]);
    setProjectName('');
    setArtistPhotos([]);
    setReferencePhotos([]);
    setPinterestUrl('');
    setBatchPhotos([]);
    setBatchPrompt('');
    clearAudio();
    setVideoResults(new Map());
    scrapedRefsRef.current = [];
    setError(null);
  };

  const handleGenerateTimeout = useCallback(() => {
    // Just let the timeout UI show; generate may still complete in background
  }, []);

  const handleRetry = useCallback(() => {
    setStep('upload');
    setGenerating(false);
    setGeneratingDeck(false);
  }, []);

  // ── Session Timer ──

  const SessionTimer = () => {
    if (remainingMinutes === null || !paymentSessionId) return null;
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    const timeStr = hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}` : `${mins}m`;
    const isLow = remainingMinutes < 5;

    return (
      <div style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 9998,
        fontFamily: 'Unbounded, sans-serif', fontSize: '0.7rem', fontWeight: 600,
        color: isLow ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
        animation: isLow ? 'timerPulse 2s ease-in-out infinite' : undefined,
        pointerEvents: 'none',
      }}>
        {timeStr} remaining
      </div>
    );
  };

  // ── Render ──

  if (step === 'generating') {
    return (
      <>
        <SessionTimer />
        {showPayment && <PaymentModal />}
        <ErrorBoundary fallbackMessage="Generation encountered an error" onRetry={handleRetry}>
          <GeneratingView onTimeout={handleGenerateTimeout} onRetry={handleRetry} />
        </ErrorBoundary>
      </>
    );
  }

  if (step === 'deck') {
    return (
      <>
        <SessionTimer />
        {showPayment && <PaymentModal />}
        <ErrorBoundary fallbackMessage="Deck preview encountered an error" onRetry={() => setStep('results')}>
          <DeckPreview
            deckSlides={deckSlides}
            deckId={deckId}
            projectName={projectName}
            onBack={() => setStep('results')}
          />
        </ErrorBoundary>
      </>
    );
  }

  if (step === 'results') {
    return (
      <>
        <SessionTimer />
        {showPayment && <PaymentModal />}
        <ErrorBoundary fallbackMessage="Results view encountered an error" onRetry={() => setStep('upload')}>
          <ResultsGrid
          mockups={mockups}
          projectName={projectName}
          rerunningIds={rerunningIds}
          generatingVideoIds={generatingVideoIds}
          videoResults={videoResults}
          playingVideoId={playingVideoId}
          setPlayingVideoId={setPlayingVideoId}
          onDownloadAll={downloadAll}
          onDownloadSingle={downloadSingle}
          onDownloadVideo={downloadVideo}
          onRerunSingle={rerunSingle}
          onRerunAll={rerunAll}
          onGenerateDeck={generateDeckFromMockups}
          onGenerateVideo={generateVideo}
          onNew={handleNew}
        />
      </ErrorBoundary>
      </>
    );
  }

  // step === 'upload'
  return (
    <>
    <SessionTimer />
    {showPayment && <PaymentModal />}
    <ErrorBoundary fallbackMessage="Upload form encountered an error" onRetry={() => window.location.reload()}>
      {error && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '12px 24px',
          background: 'rgba(255,70,70,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,70,70,0.3)', borderRadius: '8px',
          fontSize: '0.8rem', color: '#ff6b6b', maxWidth: '500px', textAlign: 'center',
          animation: 'errorFadeIn 0.3s ease-out',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{
            marginLeft: '12px', background: 'none', border: 'none', color: '#ff6b6b',
            cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
          }}>×</button>
        </div>
      )}
      <UploadForm
        mode={mode} setMode={setMode}
        projectName={projectName} setProjectName={setProjectName}
        artistPhotos={artistPhotos} setArtistPhotos={setArtistPhotos}
        referencePhotos={referencePhotos} setReferencePhotos={setReferencePhotos}
        pinterestUrl={pinterestUrl} setPinterestUrl={setPinterestUrl}
        batchPhotos={batchPhotos} setBatchPhotos={setBatchPhotos}
        batchPrompt={batchPrompt} setBatchPrompt={setBatchPrompt}
        audioFile={audioFile} setAudioFile={setAudioFile}
        audioStartTime={audioStartTime} setAudioStartTime={setAudioStartTime}
        audioDuration={audioDuration} setAudioDuration={setAudioDuration}
        audioUrl={audioUrl} setAudioUrl={setAudioUrl}
        canGenerate={canGenerate}
        onGenerate={generate}
      />
    </ErrorBoundary>
    </>
  );
}
