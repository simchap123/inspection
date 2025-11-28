import React, { useRef, useEffect, useState } from 'react';
import { Icons } from './Icons';

interface CameraViewProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Camera access denied or unavailable.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(imageData);
      }
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center z-50 p-4">
        <p className="mb-4 text-center">{error}</p>
        <button 
          onClick={onClose}
          className="px-6 py-2 bg-white text-black rounded-full font-semibold"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Overlay Guides */}
        <div className="absolute inset-0 border-2 border-white/30 m-8 rounded-lg pointer-events-none"></div>
      </div>

      {/* Controls */}
      <div className="h-32 bg-black/80 flex items-center justify-around px-8 pb-8 pt-4">
        <button 
          onClick={onClose}
          className="text-white font-medium p-4"
        >
          Cancel
        </button>
        
        <button 
          onClick={takePhoto}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white/50 transition-all"
        >
          <div className="w-16 h-16 bg-white rounded-full"></div>
        </button>
        
        <div className="w-16"></div> {/* Spacer for balance */}
      </div>

      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
