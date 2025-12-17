import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, AlertCircle } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [useNativeScanner, setUseNativeScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if BarcodeDetector is available (modern browsers)
    if ('BarcodeDetector' in window) {
      setUseNativeScanner(true);
      startNativeScanner();
    } else {
      // Fallback to html5-qrcode
      startHtml5Scanner();
    }

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Clean up html5-qrcode scanner
    if (scannerRef.current) {
      try {
        scannerRef.current.clear().catch(() => {});
      } catch (e) {
        // ignore
      }
    }
  };

  const startNativeScanner = async () => {
    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start scanning with BarcodeDetector
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['qr_code']
      });

      const scanFrame = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
          animationFrameRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const barcodes = await barcodeDetector.detect(canvas);
          if (barcodes.length > 0) {
            handleScanSuccess(barcodes[0].rawValue);
            return; // Stop scanning after success
          }
        } catch (e) {
          // Continue scanning
        }

        animationFrameRef.current = requestAnimationFrame(scanFrame);
      };

      // Wait for video to be ready
      videoRef.current.addEventListener('loadedmetadata', () => {
        scanFrame();
      });

    } catch (err: any) {
      console.error('Native scanner error:', err);
      setError(err.message || 'Camera access denied. Please enable camera permissions.');
      // Fallback to html5-qrcode
      setUseNativeScanner(false);
      setTimeout(() => startHtml5Scanner(), 500);
    }
  };

  const startHtml5Scanner = () => {
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          false
        );

        scannerRef.current = scanner;

        scanner.render(
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          (error) => {
            // Ignore individual scan errors, keep scanning
          }
        );
      } catch (err) {
        console.error("Failed to initialize scanner", err);
        setError("Failed to initialize scanner");
      }
    }, 100);
  };

  const handleScanSuccess = (decodedText: string) => {
    cleanup();
    
    // Parse the scanned text
    try {
      const url = new URL(decodedText);
      const id = url.searchParams.get('join');
      if (id) {
        onScanSuccess(id);
        return;
      }
    } catch {
      // Not a URL, might be raw ID
    }
    
    // Treat as raw ID
    onScanSuccess(decodedText);
  };

  return (
    <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-[60] p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md relative shadow-2xl border-2 border-slate-700">
        {/* Header with Sign */}
        <div className="bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600 p-4 rounded-t-2xl">
          <div className="flex items-center justify-center gap-3">
            <Camera className="w-6 h-6 text-white" />
            <h3 className="text-xl font-black text-white uppercase tracking-wide">QR Scanner</h3>
          </div>
          <p className="text-blue-100 text-xs mt-1 text-center font-semibold">
            Point camera at QR code
          </p>
        </div>

        {/* Close Button */}
        <button 
          onClick={() => {
            cleanup();
            onClose();
          }}
          className="absolute top-2 right-2 p-2 bg-slate-700/80 hover:bg-slate-600 rounded-full z-10 transition-all hover:scale-110"
        >
          <X className="text-white w-5 h-5" />
        </button>

        {/* Scanner Area */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {useNativeScanner ? (
            <div className="relative bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-auto max-h-[400px] object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Scanning Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-64 h-64">
                  {/* Corner indicators */}
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-emerald-400"></div>
                  
                  {/* Scanning line */}
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse"></div>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white text-sm font-semibold bg-black/60 inline-block px-4 py-2 rounded-full">
                  Scanning...
                </p>
              </div>
            </div>
          ) : (
            <div id="qr-reader" className="rounded-xl overflow-hidden"></div>
          )}

          <p className="text-slate-400 text-xs text-center mt-4">
            {useNativeScanner ? 'Using native browser scanner' : 'Using fallback scanner'}
          </p>
        </div>
      </div>
    </div>
  );
};
