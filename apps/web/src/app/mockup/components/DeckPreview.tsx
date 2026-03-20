'use client';

import React from 'react';
import { saveAs } from 'file-saver';
import { API } from './types';
import { useIsMobile } from './useIsMobile';

interface DeckPreviewProps {
  deckSlides: string[];
  deckId: string;
  projectName: string;
  onBack: () => void;
}

export default function DeckPreview({ deckSlides, deckId, projectName, onBack }: DeckPreviewProps) {
  const isMobile = useIsMobile();

  const downloadPdf = async () => {
    try {
      const res = await fetch(`${API}/api/mockup/deck/${deckId}/pdf`);
      if (!res.ok) { alert('PDF not found — generate a new deck.'); return; }
      saveAs(await res.blob(), `${projectName || 'mockup-deck'}.pdf`);
    } catch {
      alert('Failed to download PDF. Please try again.');
    }
  };

  const downloadPptx = async () => {
    try {
      const res = await fetch(`${API}/api/mockup/deck/${deckId}/pptx`);
      if (!res.ok) { alert('PPTX not found — generate a new deck.'); return; }
      saveAs(await res.blob(), `${projectName || 'mockup-deck'}.pptx`);
    } catch {
      alert('Failed to download PPTX. Please try again.');
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '10px 20px', fontSize: '0.65rem', fontWeight: 700,
    fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
    background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', padding: '24px', position: 'relative' }}>
      {isMobile
        ? <div className="static-bg" />
        : <video autoPlay loop muted playsInline src="/0227.mov" className="video-bg" style={{ opacity: 0.15 }} />
      }

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '24px', position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 0',
      }}>
        <button onClick={onBack} style={{
          padding: '10px 16px', fontSize: '0.65rem', fontWeight: 700,
          fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'none', color: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', cursor: 'pointer',
        }}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={downloadPdf} style={btnStyle}>PDF</button>
          <button onClick={downloadPptx} style={btnStyle}>PPTX</button>
        </div>
      </div>

      {/* Slides */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        {deckSlides.map((slideImg, i) => (
          <div key={i} style={{
            width: '100%', maxWidth: '1100px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.3)', overflow: 'hidden',
          }}>
            <img src={`data:image/jpeg;base64,${slideImg}`} style={{ width: '100%', display: 'block' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
