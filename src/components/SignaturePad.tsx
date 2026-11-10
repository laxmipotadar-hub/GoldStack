import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, Check, PenTool } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (signatureBase64: string | null) => void;
  label?: string;
  sublabel?: string;
  signatoryName?: string;
  required?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onSignatureChange,
  label = 'Digital Signature',
  sublabel = 'डिजिटल हस्ताक्षर करें',
  signatoryName,
  required = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set display resolution vs internal pixel ratio
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#231a13'; // Deep Espresso ink

    // Clear background
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => {
    initCanvas();
    window.addEventListener('resize', initCanvas);
    return () => window.removeEventListener('resize', initCanvas);
  }, [initCanvas]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else if ('clientX' in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e.nativeEvent);
    lastPointRef.current = coords;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentCoords = getCoordinates(e.nativeEvent);
    const lastCoords = lastPointRef.current;

    if (lastCoords) {
      ctx.beginPath();
      ctx.moveTo(lastCoords.x, lastCoords.y);
      ctx.lineTo(currentCoords.x, currentCoords.y);
      ctx.stroke();
    }

    lastPointRef.current = currentCoords;
    if (!hasSignature) {
      setHasSignature(true);
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const dataUrl = canvas.toDataURL('image/png');
      onSignatureChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    onSignatureChange(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div>
          <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wide flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-primary" />
            <span>{label}</span>
            {required && <span className="text-error">*</span>}
          </label>
          <span className="font-label-vernacular text-label-vernacular text-on-surface-variant block leading-tight">
            {sublabel} {signatoryName ? `(${signatoryName})` : ''}
          </span>
        </div>

        {hasSignature && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-label-sm text-secondary hover:bg-surface-container-high rounded-md transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear (मिटाएं)</span>
          </button>
        )}
      </div>

      <div className="relative w-full h-32 rounded-xl border-2 border-dashed border-outline-variant hover:border-primary/60 bg-surface-container-lowest overflow-hidden transition-colors shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {!hasSignature && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-on-surface-variant/40">
            <PenTool className="w-6 h-6 mb-1 opacity-50" />
            <span className="font-label-sm text-label-sm">Draw signature here with finger or mouse</span>
            <span className="font-label-vernacular text-label-vernacular">यहाँ अपनी दस्तखत (हस्ताक्षर) करें</span>
          </div>
        )}

        {hasSignature && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-surface-container-high/90 backdrop-blur-xs px-2 py-0.5 rounded-full text-primary pointer-events-none">
            <Check className="w-3 h-3" />
            <span className="font-label-sm text-[10px] font-bold">Signed</span>
          </div>
        )}
      </div>
    </div>
  );
};

