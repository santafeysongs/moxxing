'use client';

import React from 'react';
import ImageUploadBox from './ImageUploadBox';
import AudioUploader from './AudioUploader';
import { useIsMobile } from './useIsMobile';
import { MAX_ARTIST_PHOTOS, MAX_REFERENCE_PHOTOS } from './types';

interface UploadFormProps {
  mode: 'scene' | 'wardrobe' | 'batch';
  setMode: (m: 'scene' | 'wardrobe' | 'batch') => void;
  projectName: string;
  setProjectName: (s: string) => void;
  artistPhotos: File[];
  setArtistPhotos: React.Dispatch<React.SetStateAction<File[]>>;
  referencePhotos: File[];
  setReferencePhotos: React.Dispatch<React.SetStateAction<File[]>>;
  pinterestUrl: string;
  setPinterestUrl: (s: string) => void;
  batchPhotos: File[];
  setBatchPhotos: React.Dispatch<React.SetStateAction<File[]>>;
  batchPrompt: string;
  setBatchPrompt: (s: string) => void;
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  audioStartTime: number;
  setAudioStartTime: (t: number) => void;
  audioDuration: number;
  setAudioDuration: (d: number) => void;
  audioUrl: string | null;
  setAudioUrl: (u: string | null) => void;
  canGenerate: boolean;
  onGenerate: () => void;
}

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

export default function UploadForm(props: UploadFormProps) {
  const {
    mode, setMode, projectName, setProjectName,
    artistPhotos, setArtistPhotos, referencePhotos, setReferencePhotos,
    pinterestUrl, setPinterestUrl,
    batchPhotos, setBatchPhotos, batchPrompt, setBatchPrompt,
    audioFile, setAudioFile, audioStartTime, setAudioStartTime,
    audioDuration, setAudioDuration, audioUrl, setAudioUrl,
    canGenerate, onGenerate,
  } = props;

  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight: '100vh', background: '#000', position: 'relative', isolation: 'isolate' }}>
      {/* Video or static background */}
      {isMobile
        ? <div className="static-bg" />
        : <>
            <video autoPlay loop muted playsInline src="/0227.mov" className="video-bg" style={{ opacity: 0.5 }} />
            <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />
          </>
      }

      {/* HERO */}
      <div style={{
        position: 'relative', zIndex: 1,
        height: '70vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <h1 className="hero-title" style={{
          fontFamily: 'var(--font-unbounded)',
          fontSize: 'clamp(5rem, 18vw, 14rem)',
          fontWeight: 900, textTransform: 'uppercase',
          letterSpacing: '-0.03em', lineHeight: 0.85,
          textAlign: 'center', color: '#fff',
          animation: 'blurReveal 1.5s ease-out forwards, pulseGlow 4s ease-in-out 1.5s infinite',
          opacity: 0, mixBlendMode: 'difference',
          cursor: 'default', userSelect: 'none', pointerEvents: 'none',
        }}>
          MOXXING
        </h1>

        {/* Mode toggle */}
        <div className="mode-toggle" style={{
          position: 'absolute', bottom: '48px',
          display: 'flex', gap: '4px',
          background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '4px',
          animation: 'fadeIn 1s ease-out 1.2s forwards', opacity: 0,
        }}>
          {(['scene', 'wardrobe', 'batch'] as const).map(m => (
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

      {/* FORM */}
      <div className="mf" style={{
        position: 'relative', zIndex: 2,
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

          {/* Audio */}
          <AudioUploader
            audioFile={audioFile}
            setAudioFile={setAudioFile}
            audioStartTime={audioStartTime}
            setAudioStartTime={setAudioStartTime}
            audioDuration={audioDuration}
            setAudioDuration={setAudioDuration}
            audioUrl={audioUrl}
            setAudioUrl={setAudioUrl}
          />

          {mode === 'batch' ? (
            <>
              <ImageUploadBox
                id="batch-upload"
                label="Photos"
                description="Upload up to 50 photos — the same effect will be applied to each"
                files={batchPhotos}
                setFiles={setBatchPhotos}
                maxCount={50}
                countLabel={`(${batchPhotos.length}/50)`}
              />

              <ImageUploadBox
                id="ref-upload"
                label="Reference"
                description="Style reference — the look to apply across all photos"
                files={referencePhotos}
                setFiles={setReferencePhotos}
                maxCount={MAX_REFERENCE_PHOTOS}
                countLabel="(optional)"
              />

              <div style={{ marginBottom: '64px' }}>
                <label style={labelStyle}>Prompt</label>
                <input
                  placeholder="Describe the effect to apply"
                  value={batchPrompt}
                  onChange={(e) => setBatchPrompt(e.target.value)}
                  style={inputCss}
                />
              </div>
            </>
          ) : (
            <>
              <ImageUploadBox
                id="artist-upload"
                label="Subject"
                description="Upload photos — adding multiple angles helps with consistency"
                files={artistPhotos}
                setFiles={setArtistPhotos}
                maxCount={MAX_ARTIST_PHOTOS}
              />

              <ImageUploadBox
                id="ref-upload"
                label={mode === 'scene' ? 'References' : 'Wardrobe'}
                description={mode === 'scene' ? 'Scenes, settings, and environments' : 'Outfits, looks, and styling references'}
                files={referencePhotos}
                setFiles={setReferencePhotos}
                maxCount={MAX_REFERENCE_PHOTOS}
              />

              <div style={{ marginBottom: '64px' }}>
                <label style={labelStyle}>Pinterest</label>
                <input
                  placeholder="Paste a board URL"
                  value={pinterestUrl}
                  onChange={(e) => setPinterestUrl(e.target.value)}
                  style={inputCss}
                />
              </div>
            </>
          )}

          {/* Generate */}
          <button
            onClick={onGenerate}
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
