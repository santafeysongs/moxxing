'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Step = 'input' | 'curate' | 'recognize' | 'generating';

export default function CreatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const artistFileInputRef = useRef<HTMLInputElement>(null);
  const productRefInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [images, setImages] = useState<File[]>([]);
  const [artistPhotos, setArtistPhotos] = useState<File[]>([]);
  const [productRefs, setProductRefs] = useState<File[]>([]);
  const [artistName, setArtistName] = useState('');
  const [pinterestUrl, setPinterestUrl] = useState('');
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>(['']);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [textBrief, setTextBrief] = useState('');
  const [referenceDecks, setReferenceDecks] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [pinterestScraping, setPinterestScraping] = useState(false);
  const [pinterestScraped, setPinterestScraped] = useState(false);
  const deckInputRef = useRef<HTMLInputElement>(null);
  const [starredIndices, setStarredIndices] = useState<Set<number>>(new Set());
  const [selectedFontStyles, setSelectedFontStyles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Recognition state
  interface RecognizedNode {
    id: string; name: string; category: number; categoryName: string;
    specificity: string; frequency: number; type: string; weight: number;
    imageIndices: number[];
  }
  const [recognizedNodes, setRecognizedNodes] = useState<RecognizedNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [recognizing, setRecognizing] = useState(false);
  const [nodesExpanded, setNodesExpanded] = useState(false);
  const [missingContext, setMissingContext] = useState('');
  const [recognitionSummary, setRecognitionSummary] = useState('');

  const thumbnailUrls = useMemo(() => images.map(img => URL.createObjectURL(img)), [images]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...files].slice(0, 200));
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...files].slice(0, 200));
  }, []);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setStarredIndices(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const toggleStar = (index: number) => {
    setStarredIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else if (next.size < 20) next.add(index);
      return next;
    });
  };

  const toggleFontStyle = (id: string) => {
    setSelectedFontStyles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const FONT_BUCKETS = [
    { id: 'grotesque', label: 'Grotesque', sub: 'Helvetica, Akzidenz, Arial', vibe: 'Clean, universal, modernist' },
    { id: 'neo-grotesk', label: 'Neo-Grotesk', sub: 'Neue Haas, Suisse, Untitled', vibe: 'Contemporary, tech-forward' },
    { id: 'geometric', label: 'Geometric', sub: 'Futura, Avant Garde, Gilroy', vibe: 'Bauhaus, structural, bold' },
    { id: 'humanist', label: 'Humanist Sans', sub: 'Gill Sans, Frutiger, Myriad', vibe: 'Warm, approachable, organic' },
    { id: 'transitional-serif', label: 'Transitional Serif', sub: 'Times, Baskerville, Georgia', vibe: 'Editorial, literary, classic' },
    { id: 'didone', label: 'Didone / High Contrast', sub: 'Bodoni, Didot, Playfair', vibe: 'Fashion, luxury, dramatic' },
    { id: 'slab', label: 'Slab Serif', sub: 'Rockwell, Clarendon, Memphis', vibe: 'Industrial, bold, vintage' },
    { id: 'old-style', label: 'Old Style Serif', sub: 'Garamond, Caslon, Bembo', vibe: 'Timeless, literary, warm' },
    { id: 'mono', label: 'Monospace', sub: 'Courier, JetBrains, SF Mono', vibe: 'Technical, raw, utilitarian' },
    { id: 'handwritten', label: 'Handwritten / Script', sub: 'Brush, marker, calligraphy', vibe: 'Personal, DIY, emotional' },
    { id: 'display', label: 'Display / Decorative', sub: 'Custom, experimental, bespoke', vibe: 'Statement, loud, one-of-a-kind' },
    { id: 'blackletter', label: 'Blackletter / Gothic', sub: 'Fraktur, Old English', vibe: 'Metal, streetwear, heritage' },
    { id: 'rounded', label: 'Rounded', sub: 'Nunito, Comfortaa, Varela', vibe: 'Friendly, playful, soft' },
    { id: 'condensed', label: 'Condensed / Compressed', sub: 'Impact, Knockout, Oswald', vibe: 'Editorial, urgent, high-impact' },
    { id: 'brutalist', label: 'Brutalist / Industrial', sub: 'Druk, GT America, Antique Olive', vibe: 'Raw, confrontational, heavy' },
    { id: 'retro', label: 'Retro / Vintage', sub: 'Cooper Black, Windsor, Souvenir', vibe: '70s, nostalgic, groovy' },
  ];

  const addYoutubeUrl = () => setYoutubeUrls(prev => [...prev, '']);
  const updateYoutubeUrl = (index: number, value: string) => {
    setYoutubeUrls(prev => prev.map((u, i) => i === index ? value : u));
  };

  const handleGenerate = async () => {
    setStep('generating');
    setLoading(true);
    try {
      const formData = new FormData();
      images.forEach(img => formData.append('images', img));
      artistPhotos.forEach(img => formData.append('artist_photos', img));
      productRefs.forEach(img => formData.append('product_refs', img));
      referenceDecks.forEach(deck => formData.append('reference_decks', deck));
      const starredArray = Array.from(starredIndices).sort((a, b) => a - b);
      formData.append('starred_indices', JSON.stringify(starredArray));
      if (pinterestUrl) formData.append('pinterest_url', pinterestUrl);
      const validYt = youtubeUrls.filter(u => u.trim());
      if (validYt.length) formData.append('youtube_urls', JSON.stringify(validYt));
      const allArtists = artistName.trim() ? [artistName.trim(), ...selectedArtists] : selectedArtists;
      if (allArtists.length) formData.append('artist_names', JSON.stringify(allArtists));
      if (textBrief) formData.append('text_brief', textBrief);
      if (selectedFontStyles.size > 0) formData.append('font_directions', JSON.stringify(Array.from(selectedFontStyles)));
      // Recognition data
      if (selectedNodeIds.size > 0) {
        const selectedNodes = recognizedNodes.filter(n => selectedNodeIds.has(n.id));
        formData.append('cultural_nodes', JSON.stringify(selectedNodes));
      }
      if (missingContext.trim()) formData.append('missing_context', missingContext.trim());
      const res = await fetch(`${API}/api/campaigns`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.campaign_id) router.push(`/campaign/${data.campaign_id}`);
    } catch (e) {
      console.error('Failed to create campaign:', e);
      setStep('curate');
    } finally {
      setLoading(false);
    }
  };

  const hasInput = images.length > 0 || pinterestUrl.trim();

  // Shared styles
  const pageFont: React.CSSProperties = {
    fontFamily: 'var(--font-unbounded)',
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-unbounded)',
    fontSize: '1.1rem',
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: '20px',
    color: 'var(--text)',
  };

  const subText: React.CSSProperties = {
    fontFamily: 'var(--font-unbounded)',
    fontSize: '0.85rem',
    fontWeight: 500,
    opacity: 0.5,
    lineHeight: 1.6,
    marginBottom: '16px',
  };

  const dropZoneBase: React.CSSProperties = {
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  // ── STEP: GENERATING (redirect happens in handleGenerate, show loading) ──
  if (step === 'generating') {
    return (
      <main className="theme-light" style={{ minHeight: '100vh', padding: '200px 80px', maxWidth: '1200px', margin: '0 auto', textAlign: 'center', fontFamily: 'var(--font-unbounded)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '24px' }}>Creating Campaign...</h2>
        <p style={{ fontSize: '1rem', opacity: 0.4 }}>Uploading images and starting analysis. You'll be redirected shortly.</p>
      </main>
    );
  }

  // ── STEP: CURATE ──
  if (step === 'curate') {
    return (
      <main className="theme-light" style={{ minHeight: '100vh', padding: '60px 80px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={sectionLabel}>Curate References</div>
          <button
            onClick={() => setStep('input')}
            style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.4 }}
          >
            ← Back
          </button>
        </div>

        <p style={{ ...subText, marginBottom: '32px', fontSize: '1.1rem' }}>
          Tap <strong>up to 20 images</strong> that define the direction. Each one becomes a hero scene in your deck.
          All {images.length} will be analyzed.
        </p>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '32px', padding: '20px 24px',
          background: starredIndices.size > 0 ? 'rgba(255,69,0,0.06)' : 'rgba(255,255,255,0.03)',
          borderRadius: '8px', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--font-unbounded)', fontSize: '2rem', fontWeight: 800 }}>
              {starredIndices.size}
            </span>
            <span style={{ fontSize: '1rem', opacity: 0.4, fontWeight: 600 }}>
              / 20 selected
            </span>
          </div>
          {starredIndices.size > 0 && (
            <button
              onClick={() => setStarredIndices(new Set())}
              style={{ fontSize: '0.9rem', opacity: 0.4, fontWeight: 600 }}
            >
              Clear all
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '10px',
          marginBottom: '64px',
        }}>
          {images.map((img, i) => {
            const isStarred = starredIndices.has(i);
            return (
              <div
                key={i}
                onClick={() => toggleStar(i)}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: isStarred ? '3px solid var(--accent, #FF4500)' : '3px solid transparent',
                  opacity: starredIndices.size > 0 && !isStarred ? 0.45 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <img src={thumbnailUrls[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {isStarred && (
                  <div style={{
                    position: 'absolute', top: '10px', right: '10px',
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'var(--accent, #FF4500)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', fontWeight: 800,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                  }}>
                    {Array.from(starredIndices).sort((a, b) => a - b).indexOf(i) + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ position: 'sticky', bottom: '24px', zIndex: 10 }}>
          <button
            className="btn-primary"
            onClick={async () => {
              // Run recognition on uploaded images, then move to recognition step
              setRecognizing(true);
              try {
                const formData = new FormData();
                images.forEach(img => formData.append('images', img));
                const res = await fetch(`${API}/api/recognize`, { method: 'POST', body: formData });
                const data = await res.json();
                if (data.nodes) {
                  setRecognizedNodes(data.nodes);
                  // Auto-select top 15 by weight
                  const autoSelected = new Set(data.nodes.slice(0, 15).map((n: any) => n.id));
                  setSelectedNodeIds(autoSelected);
                  // Build summary from auto-selected
                  const topNames = data.nodes.slice(0, 8).map((n: any) => n.name).join(', ');
                  setRecognitionSummary(topNames);
                }
                setStep('recognize');
              } catch (e) {
                console.error('Recognition failed:', e);
                // Fall through to generate anyway
                handleGenerate();
              } finally {
                setRecognizing(false);
              }
            }}
            disabled={recognizing}
            style={{ width: '100%', padding: '22px', fontSize: '1.1rem' }}
          >
            {recognizing ? 'Analyzing references...' : `Continue${starredIndices.size > 0 ? ` — ${starredIndices.size} featured` : ''}`}
          </button>
          {starredIndices.size === 0 && (
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.95rem', opacity: 0.35, fontWeight: 500 }}>
              No images selected — tap above to feature references in the deck
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── STEP: RECOGNIZE (Cultural Node Curation) ──
  if (step === 'recognize') {
    const toggleNode = (id: string) => {
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < 20) next.add(id);
        return next;
      });
    };

    const CATEGORY_COLORS: Record<number, string> = {
      1: '#ff4500', 2: '#3b82f6', 3: '#8b5cf6', 4: '#ec4899',
      5: '#14b8a6', 6: '#f59e0b', 7: '#6366f1', 8: '#84cc16',
      9: '#06b6d4', 10: '#f43f5e', 11: '#a855f7', 12: '#ef4444',
      13: '#10b981', 14: '#d946ef',
    };

    return (
      <main className="theme-light" style={{ minHeight: '100vh', padding: '60px 80px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-unbounded)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={sectionLabel}>Cultural Recognition</div>
          <button onClick={() => setStep('curate')} style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.4 }}>
            ← Back
          </button>
        </div>

        {/* Summary */}
        <div style={{
          padding: '24px 28px', marginBottom: '28px',
          background: 'rgba(0,0,0,0.03)', borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            We found {recognizedNodes.length} cultural signals across your references
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1.6, opacity: 0.7 }}>
            {recognitionSummary}
          </div>
        </div>

        {/* Missing context input */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            What's missing? Anything the photos don't show?
          </div>
          <textarea
            value={missingContext}
            onChange={e => setMissingContext(e.target.value)}
            placeholder="e.g. he's obsessed with Japanese denim, loves Bon Iver, grew up in the Gulf South..."
            rows={2}
            style={{
              width: '100%', padding: '14px', borderRadius: '6px',
              border: '1px solid var(--border)', background: '#fff',
              fontSize: '0.9rem', fontFamily: 'var(--font-body)', lineHeight: 1.6,
              resize: 'vertical',
            }}
          />
        </div>

        {/* Node count */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{selectedNodeIds.size}</span>
            <span style={{ fontSize: '0.85rem', opacity: 0.4, fontWeight: 600 }}>/ 20 nodes selected</span>
          </div>
          <button
            onClick={() => setNodesExpanded(!nodesExpanded)}
            style={{
              fontSize: '0.85rem', fontWeight: 700, opacity: 0.6,
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {nodesExpanded ? 'Collapse' : 'Edit nodes'}
          </button>
        </div>

        {/* Expandable node grid */}
        {nodesExpanded && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px',
            marginBottom: '32px', padding: '20px',
            background: '#fff', borderRadius: '8px', border: '1px solid var(--border)',
            maxHeight: '400px', overflowY: 'auto',
          }}>
            {recognizedNodes.map(node => {
              const isSelected = selectedNodeIds.has(node.id);
              const color = CATEGORY_COLORS[node.category] || '#888';
              return (
                <button
                  key={node.id}
                  onClick={() => toggleNode(node.id)}
                  title={node.specificity}
                  style={{
                    padding: '6px 14px', borderRadius: '20px',
                    border: isSelected ? `2px solid ${color}` : '2px solid var(--border)',
                    background: isSelected ? `${color}10` : 'transparent',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    opacity: isSelected ? 1 : 0.5,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: isSelected ? color : 'inherit' }}>{node.name}</span>
                  {node.frequency > 1 && (
                    <span style={{ marginLeft: '6px', fontSize: '0.7rem', opacity: 0.4 }}>×{node.frequency}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Generate button */}
        <div style={{ position: 'sticky', bottom: '24px', zIndex: 10 }}>
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{ width: '100%', padding: '22px', fontSize: '1.1rem' }}
          >
            {loading ? 'Generating...' : 'Generate Creative Direction'}
          </button>
        </div>
      </main>
    );
  }

  // ── STEP: INPUT ──
  return (
    <main className="theme-light" style={{ minHeight: '100vh', padding: '80px 80px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-unbounded)' }}>

      {/* Page title */}
      <h2 style={{ marginBottom: '64px', fontSize: '2.8rem' }}>New Campaign</h2>

      {/* Artist Section */}
      <section style={{ marginBottom: '56px' }}>
        <div style={sectionLabel}>Artist</div>
        <input
          placeholder="Artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          style={{ marginBottom: '20px', fontSize: '1.2rem', padding: '20px 24px' }}
        />
        <p style={subText}>
          Artist Photos ({artistPhotos.length}/8) — upload multiple for variety. The system auto-pairs each photo to a reference scene based on lighting and mood.
        </p>
        <div
          onClick={() => artistFileInputRef.current?.click()}
          style={{
            ...dropZoneBase,
            border: `2px dashed var(--border)`,
            padding: artistPhotos.length > 0 ? '20px' : '48px',
            textAlign: 'center',
          }}
        >
          <input
            ref={artistFileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
              setArtistPhotos(prev => [...prev, ...files].slice(0, 10));
            }}
            style={{ display: 'none' }}
          />
          {artistPhotos.length === 0 ? (
            <div style={{ fontSize: '1.05rem', opacity: 0.35, fontWeight: 500 }}>
              Drop headshots, press photos, or any clear photos of the artist
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {artistPhotos.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: '100px', height: '100px' }}>
                  <img src={URL.createObjectURL(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setArtistPhotos(prev => prev.filter((_, j) => j !== i)); }}
                    style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Mood Board Images */}
      <section style={{ marginBottom: '56px' }}>
        <div style={sectionLabel}>Mood Board ({images.length}/200)</div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...dropZoneBase,
            border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
            padding: images.length > 0 ? '24px' : '80px',
            textAlign: 'center',
            background: dragActive ? 'rgba(0,0,0,0.02)' : 'transparent',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {images.length === 0 ? (
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, opacity: 0.5, marginBottom: '12px' }}>
                Drop images here or click to browse
              </div>
              <div style={{ fontSize: '1rem', opacity: 0.3, fontWeight: 500 }}>
                JPG, PNG, WebP — up to 200 images
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: '100px', height: '100px' }}>
                  <img src={thumbnailUrls[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                    style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pinterest */}
      <section style={{ marginBottom: '48px' }}>
        <div style={sectionLabel}>Pinterest Board</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <input
            placeholder="https://pinterest.com/username/board-name"
            value={pinterestUrl}
            onChange={(e) => setPinterestUrl(e.target.value)}
            style={{ flex: 1, fontSize: '1.1rem' }}
          />
          {pinterestUrl.includes('pinterest') && !pinterestScraped && (
            <button
              disabled={pinterestScraping}
              onClick={async () => {
                setPinterestScraping(true);
                try {
                  const res = await fetch(`${API}/api/scrape-pinterest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: pinterestUrl }),
                  });
                  const data = await res.json();
                  if (data.images?.length) {
                    // Convert base64 images to File objects so they join the image grid
                    const newFiles: File[] = [];
                    for (const img of data.images) {
                      const byteString = atob(img.base64);
                      const ab = new ArrayBuffer(byteString.length);
                      const ia = new Uint8Array(ab);
                      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                      const blob = new Blob([ab], { type: 'image/jpeg' });
                      const file = new File([blob], `pinterest-${newFiles.length}.jpg`, { type: 'image/jpeg' });
                      newFiles.push(file);
                    }
                    setImages(prev => [...prev, ...newFiles]);
                    setPinterestScraped(true);
                  }
                } catch (e) {
                  console.error('Pinterest scrape failed:', e);
                } finally {
                  setPinterestScraping(false);
                }
              }}
              style={{
                padding: '16px 24px', fontSize: '1rem', fontWeight: 700,
                border: '1px solid var(--border)', borderRadius: '6px',
                background: 'var(--surface)', whiteSpace: 'nowrap',
                opacity: pinterestScraping ? 0.5 : 1,
              }}
            >
              {pinterestScraping ? 'Scraping...' : 'Import Board'}
            </button>
          )}
          {pinterestScraped && (
            <div style={{ padding: '16px 24px', fontSize: '0.9rem', fontWeight: 600, opacity: 0.5 }}>
              ✓ Imported
            </div>
          )}
        </div>
        {pinterestUrl.includes('pinterest') && (
          <div
            id="pinterest-preview"
            style={{
              display: 'none',
              border: '1px solid var(--border)', borderRadius: '6px',
              overflow: 'hidden', height: '500px', marginTop: '8px',
            }}
          >
            <iframe
              src={pinterestUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}
      </section>

      {/* Reference Decks */}
      <section style={{ marginBottom: '48px' }}>
        <div style={sectionLabel}>Reference Decks</div>
        <p style={subText}>
          Upload past creative direction decks as PDF — pages get extracted and analyzed
        </p>
        <div
          onClick={() => deckInputRef.current?.click()}
          style={{
            ...dropZoneBase,
            border: '2px dashed var(--border)',
            padding: referenceDecks.length > 0 ? '20px' : '48px',
            textAlign: 'center',
          }}
        >
          <input
            ref={deckInputRef}
            type="file"
            multiple
            accept=".pdf"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setReferenceDecks(prev => [...prev, ...files].slice(0, 5));
            }}
            style={{ display: 'none' }}
          />
          {referenceDecks.length === 0 ? (
            <div style={{ fontSize: '1.05rem', opacity: 0.35, fontWeight: 500 }}>
              Click to upload PDF decks (up to 5)
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {referenceDecks.map((deck, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 18px', background: 'var(--surface)', borderRadius: '6px',
                }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>📄 {deck.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setReferenceDecks(prev => prev.filter((_, j) => j !== i)); }}
                    style={{ fontSize: '1.1rem', opacity: 0.4, padding: '4px 12px', fontWeight: 700 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Product References */}
      <section style={{ marginBottom: '56px' }}>
        <div style={sectionLabel}>Product References</div>
        <p style={subText}>
          Upload images of products, materials, silhouettes, or physical objects that inspire the product direction — blanks, reference garments, accessories, packaging, anything tactile
        </p>
        <div
          onClick={() => productRefInputRef.current?.click()}
          style={{
            ...dropZoneBase,
            border: '2px dashed var(--border)',
            padding: productRefs.length > 0 ? '20px' : '48px',
            textAlign: 'center',
          }}
        >
          <input
            ref={productRefInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
              setProductRefs(prev => [...prev, ...files].slice(0, 20));
            }}
            style={{ display: 'none' }}
          />
          {productRefs.length === 0 ? (
            <div style={{ fontSize: '1.05rem', opacity: 0.35, fontWeight: 500 }}>
              Tees, hoodies, lighters, jewelry, packaging, fabrics, zines — whatever the product world looks like
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {productRefs.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: '100px', height: '100px' }}>
                  <img src={URL.createObjectURL(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setProductRefs(prev => prev.filter((_, j) => j !== i)); }}
                    style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Text Brief */}
      <section style={{ marginBottom: '56px' }}>
        <div style={sectionLabel}>Creative Brief</div>
        <textarea
          placeholder="Describe the creative direction, mood, references, or anything the AI should know..."
          value={textBrief}
          onChange={(e) => setTextBrief(e.target.value)}
          rows={5}
          style={{ fontSize: '1.1rem', padding: '20px 24px' }}
        />
      </section>

      {/* Typography Direction */}
      <section style={{ marginBottom: '64px' }}>
        <div style={sectionLabel}>Typography Direction</div>
        <p style={subText}>
          Select 1–3 type families that feel right for this artist's world
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '12px',
        }}>
          {FONT_BUCKETS.map(bucket => {
            const selected = selectedFontStyles.has(bucket.id);
            return (
              <div
                key={bucket.id}
                onClick={() => toggleFontStyle(bucket.id)}
                style={{
                  padding: '18px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: selected ? '2px solid var(--text)' : '2px solid var(--border)',
                  background: selected ? 'var(--text)' : 'transparent',
                  color: selected ? 'var(--bg)' : 'var(--text)',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-unbounded)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  marginBottom: '4px',
                }}>{bucket.label}</div>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  opacity: selected ? 0.7 : 0.4,
                  marginBottom: '2px',
                }}>{bucket.sub}</div>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  opacity: selected ? 0.8 : 0.35,
                  fontStyle: 'italic',
                }}>{bucket.vibe}</div>
              </div>
            );
          })}
        </div>
        {selectedFontStyles.size > 0 && (
          <div style={{ marginTop: '16px', fontSize: '0.9rem', opacity: 0.5, fontWeight: 600 }}>
            {selectedFontStyles.size} selected: {Array.from(selectedFontStyles).map(id => 
              FONT_BUCKETS.find(b => b.id === id)?.label
            ).join(', ')}
          </div>
        )}
      </section>

      {/* Action */}
      {images.length > 0 ? (
        <button
          className="btn-primary"
          onClick={() => setStep('curate')}
          disabled={!hasInput}
          style={{ width: '100%', padding: '24px', fontSize: '1.1rem' }}
        >
          Next: Curate Reference Images →
        </button>
      ) : (
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={!hasInput || loading}
          style={{ width: '100%', padding: '24px', fontSize: '1.1rem' }}
        >
          {loading ? 'Processing...' : 'Generate Creative Direction'}
        </button>
      )}

      <div style={{ height: '80px' }} />
    </main>
  );
}
