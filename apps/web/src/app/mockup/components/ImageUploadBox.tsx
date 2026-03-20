'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { validateFiles, MAX_ARTIST_PHOTOS, MAX_REFERENCE_PHOTOS, MAX_FILE_SIZE_MB } from './types';

interface ImageUploadBoxProps {
  id: string;
  label: string;
  description: string;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  maxCount: number;
  countLabel?: string;
}

function thumbUrl(f: File): string | null {
  if (f.type.startsWith('image/') && !f.type.includes('heic') && !f.type.includes('heif')) {
    return URL.createObjectURL(f);
  }
  return null;
}

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

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-unbounded)', fontSize: '0.8rem',
  fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em',
  color: '#fff', marginBottom: '14px',
};

export default function ImageUploadBox({ id, label, description, files, setFiles, maxCount, countLabel }: ImageUploadBoxProps) {
  const [error, setError] = useState<string | null>(null);

  const thumbs = useMemo(() => files.map(f => thumbUrl(f)), [files]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    const { valid, error: validationError } = validateFiles(incoming, maxCount, files.length);
    if (validationError) setError(validationError);
    else setError(null);
    if (valid.length > 0) setFiles(prev => [...prev, ...valid]);
    // Reset input so same files can be re-selected
    e.target.value = '';
  }, [files.length, maxCount, setFiles]);

  return (
    <div style={{ marginBottom: '48px' }}>
      <label style={labelStyle}>
        {label}
        {countLabel && (
          <span style={{ fontWeight: 400, fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}> {countLabel}</span>
        )}
      </label>
      <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginBottom: '14px', lineHeight: 1.5 }}>
        {description}
      </p>
      <div
        onClick={(e) => { if ((e.target as HTMLElement).closest('.thumb-del')) return; document.getElementById(id)?.click(); }}
        style={uploadBox(files.length > 0)}
      >
        <input id={id} type="file" accept="image/*,.heic,.heif" multiple onChange={handleUpload} style={{ display: 'none' }} />
        {files.length === 0
          ? <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Click to upload photos</span>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {thumbs.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: '72px', height: '90px' }}>
                  {url
                    ? <img src={url} style={{ width: '72px', height: '90px', objectFit: 'cover', borderRadius: '4px' }} />
                    : <div style={{ width: '72px', height: '90px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>HEIC</div>
                  }
                  <button className="thumb-del" onClick={(e) => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }} style={thumbDelStyle}>×</button>
                </div>
              ))}
              {files.length < maxCount && (
                <div style={{ width: '72px', height: '90px', border: '2px dashed rgba(255,255,255,0.3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>+</div>
              )}
            </div>
        }
      </div>
      {error && <div className="upload-error">{error}</div>}
    </div>
  );
}
