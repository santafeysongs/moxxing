'use client';

import React, { useState } from 'react';
import { MockupImage } from './types';
import { useIsMobile } from './useIsMobile';

interface ResultsGridProps {
  mockups: MockupImage[];
  projectName: string;
  rerunningIds: Set<string>;
  generatingVideoIds: Set<string>;
  videoResults: Map<string, string>;
  playingVideoId: string | null;
  setPlayingVideoId: (id: string | null) => void;
  onDownloadAll: () => void;
  onDownloadSingle: (m: MockupImage, idx: number) => void;
  onDownloadVideo: (mockupId: string, idx: number) => void;
  onRerunSingle: (mockupId: string) => void;
  onRerunAll: () => void;
  onGenerateDeck: () => void;
  onGenerateVideo: (mockupId: string) => void;
  onNew: () => void;
}

export default function ResultsGrid({
  mockups, projectName, rerunningIds, generatingVideoIds, videoResults,
  playingVideoId, setPlayingVideoId,
  onDownloadAll, onDownloadSingle, onDownloadVideo,
  onRerunSingle, onRerunAll, onGenerateDeck, onGenerateVideo, onNew,
}: ResultsGridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  return (
    <div style={{ background: '#000', minHeight: '100vh', position: 'relative' }}>
      {isMobile
        ? <div className="static-bg" />
        : <video autoPlay loop muted playsInline src="/0227.mov" className="video-bg" style={{ opacity: 0.15 }} />
      }

      {/* Floating top bar */}
      <div className="results-bar" style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
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
            { label: 'Download', onClick: onDownloadAll },
            { label: 'Rerun', onClick: onRerunAll },
            { label: 'Deck', onClick: onGenerateDeck },
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
          <button onClick={onNew} style={{
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
      <div className="results-grid" style={{
        position: 'relative', zIndex: 1,
        gridTemplateColumns: `repeat(${Math.min(5, mockups.length)}, 1fr)`,
        background: '#000',
      }}>
        {mockups.map((m, idx) => (
          <div
            key={m.id}
            style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', cursor: 'pointer' }}
            onMouseEnter={() => setHoveredId(m.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => setHoveredId(prev => prev === m.id ? null : m.id)}
          >
            {/* Video playback layer */}
            {playingVideoId === m.id && videoResults.has(m.id) && (
              <video
                autoPlay loop playsInline
                src={`data:video/mp4;base64,${videoResults.get(m.id)}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, zIndex: 1 }}
                onClick={(e) => { e.stopPropagation(); setPlayingVideoId(null); }}
              />
            )}
            <img
              src={`data:image/png;base64,${m.base64}`}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: (rerunningIds.has(m.id) || generatingVideoIds.has(m.id)) ? 0.2 : playingVideoId === m.id ? 0 : 1,
                transition: 'all 0.3s',
                transform: hoveredId === m.id ? 'scale(1.03)' : 'scale(1)',
              }}
            />
            {/* Play button */}
            {videoResults.has(m.id) && playingVideoId !== m.id && !generatingVideoIds.has(m.id) && !rerunningIds.has(m.id) && (
              <button
                onClick={(e) => { e.stopPropagation(); setPlayingVideoId(m.id); }}
                style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  zIndex: 2, background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.6)',
                  borderRadius: '50%', width: '48px', height: '48px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', transition: 'all 0.2s',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              </button>
            )}
            {/* Loading spinner */}
            {(rerunningIds.has(m.id) || generatingVideoIds.has(m.id)) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                {generatingVideoIds.has(m.id) ? (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ animation: 'mockup-spin 2s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" />
                    </svg>
                    <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px', fontFamily: 'var(--font-unbounded)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Generating video</span>
                  </>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: 'mockup-spin 1s linear infinite' }}>
                    <path d="M1 4v4h4" /><path d="M15 12V8h-4" />
                    <path d="M13.5 5.5A6 6 0 0 0 3 4l-2 2" /><path d="M2.5 10.5A6 6 0 0 0 13 12l2-2" />
                  </svg>
                )}
              </div>
            )}
            {/* Hover overlay */}
            {hoveredId === m.id && !rerunningIds.has(m.id) && !generatingVideoIds.has(m.id) && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
                padding: '32px 12px 12px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDownloadSingle(m, idx); }}
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                      width: '32px', height: '32px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v9M4 8l4 4 4-4M2 14h12" />
                    </svg>
                  </button>
                  {videoResults.has(m.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDownloadVideo(m.id, idx); }}
                      style={{
                        background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                        width: '32px', height: '32px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2v9M4 8l4 4 4-4M2 14h12" />
                        <circle cx="13" cy="3" r="2.5" fill="#fff" stroke="none" />
                      </svg>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerateVideo(m.id); }}
                    title={videoResults.has(m.id) ? 'Regenerate video' : 'Generate video'}
                    style={{
                      background: videoResults.has(m.id) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                      border: 'none', borderRadius: '50%',
                      width: '32px', height: '32px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" fill="rgba(255,255,255,0.8)" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRerunSingle(m.id); }}
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                      width: '32px', height: '32px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v4h4" /><path d="M15 12V8h-4" />
                      <path d="M13.5 5.5A6 6 0 0 0 3 4l-2 2" /><path d="M2.5 10.5A6 6 0 0 0 13 12l2-2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
