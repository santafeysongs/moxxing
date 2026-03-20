'use client';

import React, { useState, useCallback, useRef } from 'react';

interface AudioUploaderProps {
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  audioStartTime: number;
  setAudioStartTime: (t: number) => void;
  audioDuration: number;
  setAudioDuration: (d: number) => void;
  audioUrl: string | null;
  setAudioUrl: (u: string | null) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-unbounded)', fontSize: '0.8rem',
  fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em',
  color: '#fff', marginBottom: '14px',
};

export default function AudioUploader({
  audioFile, setAudioFile, audioStartTime, setAudioStartTime,
  audioDuration, setAudioDuration, audioUrl, setAudioUrl,
}: AudioUploaderProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleAudioUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioStartTime(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration);
    });
  }, [audioUrl, setAudioFile, setAudioStartTime, setAudioUrl, setAudioDuration]);

  const clearAudio = useCallback(() => {
    setAudioFile(null);
    setAudioStartTime(0);
    setAudioDuration(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioPlaying(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, [audioUrl, setAudioFile, setAudioStartTime, setAudioDuration, setAudioUrl]);

  const previewAudio = useCallback(() => {
    if (!audioUrl) return;
    if (audioPlaying && audioRef.current) {
      audioRef.current.pause();
      setAudioPlaying(false);
      return;
    }
    const audio = new Audio(audioUrl);
    audio.currentTime = audioStartTime;
    audioRef.current = audio;
    audio.play();
    setAudioPlaying(true);
    setTimeout(() => { audio.pause(); setAudioPlaying(false); }, 8000);
    audio.addEventListener('ended', () => setAudioPlaying(false));
  }, [audioUrl, audioStartTime, audioPlaying]);

  return (
    <div style={{ marginBottom: '48px' }}>
      <label style={labelStyle}>Audio <span style={{ fontWeight: 400, fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>(optional)</span></label>
      <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginBottom: '14px', lineHeight: 1.5 }}>
        Upload a song — select an 8-second window to add to generated videos
      </p>
      {audioFile && audioDuration > 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span style={{ flex: 1, fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audioFile.name}</span>
            <button onClick={clearAudio} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 700, color: '#fff',
            }}>×</button>
          </div>

          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <div style={{
              width: '100%', height: '40px', background: 'rgba(255,255,255,0.04)',
              borderRadius: '4px', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(audioStartTime / audioDuration) * 100}%`,
                width: `${(Math.min(8, audioDuration - audioStartTime) / audioDuration) * 100}%`,
                background: 'rgba(255,255,255,0.12)',
                borderLeft: '2px solid rgba(255,255,255,0.6)',
                borderRight: '2px solid rgba(255,255,255,0.6)',
                transition: 'left 0.1s, width 0.1s',
              }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '1px', padding: '0 2px' }}>
                {Array.from({ length: 80 }, (_, i) => {
                  const h = 15 + Math.sin(i * 0.7) * 12 + Math.sin(i * 1.3) * 8 + Math.cos(i * 0.3) * 6;
                  return <div key={i} style={{ flex: 1, height: `${Math.max(10, Math.min(90, h + 20))}%`, background: 'rgba(255,255,255,0.15)', borderRadius: '1px' }} />;
                })}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, audioDuration - 8)}
              step={0.1}
              value={audioStartTime}
              onChange={(e) => setAudioStartTime(Number(e.target.value))}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: 0, cursor: 'pointer', margin: 0,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: '0.7rem', fontFamily: 'var(--font-unbounded)',
              color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em',
            }}>
              {Math.floor(audioStartTime / 60)}:{String(Math.floor(audioStartTime % 60)).padStart(2, '0')}
              {' — '}
              {Math.floor(Math.min(audioStartTime + 8, audioDuration) / 60)}:{String(Math.floor(Math.min(audioStartTime + 8, audioDuration) % 60)).padStart(2, '0')}
              <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: '8px' }}>
                / {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}
              </span>
            </span>
            <button onClick={previewAudio} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px',
              padding: '6px 14px', cursor: 'pointer',
              fontSize: '0.6rem', fontWeight: 700, fontFamily: 'var(--font-unbounded)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.6)', transition: 'all 0.15s',
            }}>
              {audioPlaying ? '■ Stop' : '▶ Preview'}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => document.getElementById('audio-upload')?.click()}
          style={{
            background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '2px dashed rgba(255,255,255,0.4)', borderRadius: '8px', padding: '28px',
            textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Click to upload audio</span>
        </div>
      )}
      <input id="audio-upload" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={handleAudioUpload} style={{ display: 'none' }} />
    </div>
  );
}
