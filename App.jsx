import React, { useState, useEffect, useRef } from 'react';
import { Upload, Check, Download, RefreshCcw, FileVideo, Loader2, AlertCircle } from 'lucide-react';

const FFmpeg = typeof window !== 'undefined' ? (window.FFmpeg || class {}) : class {};

const fetchFile = async (file) => {
  if (file instanceof File) {
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("Input must be a File object.");
};

const toBlobURL = async (url, mimeType) => {
  const data = await fetch(url).then(response => response.blob());
  return URL.createObjectURL(new Blob([data], { type: mimeType }));
};

export default function App() {
  const [step, setStep] = useState('upload'); 
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resolution, setResolution] = useState('720');
  const [compress, setCompress] = useState(null);
  const [format, setFormat] = useState('mp4');
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState(null);
  const ffmpegRef = useRef(null);

  const load = async () => {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = new window.FFmpeg.FFmpeg();
    ffmpegRef.current = ffmpeg;
    
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setLoaded(true);
    } catch (error) {
      console.error(error);
      setErrorMsg("Error: El navegador bloqueó SharedArrayBuffer. Revisa los headers de CORS.");
      setStep('error');
    }
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd/ffmpeg.messaging.js';
    script.async = true;
    script.onload = () => load();
    document.body.appendChild(script);
    
    return () => {
      if (ffmpegRef.current) ffmpegRef.current.terminate();
    };
  }, []);

  const validateAndSetFile = (uploadedFile) => {
    if (uploadedFile.type.startsWith('video/')) {
      setFile(uploadedFile);
      setStep('config');
    } else {
      setErrorMsg("Solo archivos de video");
      setStep('error');
    }
  };

  const transcode = async () => {
    if (compress === null) return;
    setStep('processing');
    setProgress(0);
    
    const ffmpeg = ffmpegRef.current;
    const inputName = 'input' + (file.name.includes('.') ? '.' + file.name.split('.').pop() : '');
    const outputName = `output.${format}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const crfValue = compress ? '28' : '23'; 
      
      const args = [
        '-i', inputName,
        '-vf', `scale=-2:${resolution}`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', crfValue, 
        outputName
      ];

      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([data.buffer], { type: `video/${format}` }));
      setOutputUrl(url);
      setStep('download');

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      setErrorMsg("Error procesando el video.");
      setStep('error');
    }
  };

  const resetApp = () => {
    setFile(null);
    setStep('upload');
    setResolution('720');
    setCompress(null);
    setProgress(0);
    setOutputUrl(null);
  };

  const OptionButton = ({ selected, onClick, label }) => (
    <button onClick={onClick} className={`px-6 py-3 text-sm font-medium transition-all rounded-lg ${selected ? 'bg-black text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>{label}</button>
  );

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center font-sans text-gray-800 p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {!loaded && step !== 'error' && (
           <div className="text-xs text-orange-400 flex items-center gap-2 animate-pulse">
             <Loader2 className="w-3 h-3 animate-spin"/> Cargando motor...
           </div>
        )}

        {step === 'error' && (
           <div className="text-center p-6 bg-red-50 rounded-xl flex flex-col items-center gap-4">
             <AlertCircle className="w-8 h-8 text-red-500" />
             <p className="text-red-500 text-sm font-medium">{errorMsg}</p>
             <button onClick={() => window.location.reload()} className="text-xs underline text-red-400">Recargar página</button>
           </div>
        )}

        {step === 'upload' && loaded && (
          <div 
            className={`w-full h-64 border border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); validateAndSetFile(e.dataTransfer.files[0]); }}
            onClick={() => document.getElementById('videoInput').click()}
          >
            <input id="videoInput" type="file" accept="video/*" className="hidden" onChange={(e) => validateAndSetFile(e.target.files[0])} />
            <Upload className="w-6 h-6 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-400">Sube tu video</p>
          </div>
        )}

        {step === 'config' && (
          <div className="w-full flex flex-col gap-6">
            <div className="text-center text-xs text-gray-400 truncate w-full">{file?.name}</div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-gray-400 text-center">Resolución</span>
              <div className="flex justify-center gap-2">
                {['720', '480', '360'].map(res => (
                  <OptionButton key={res} selected={resolution === res} onClick={() => setResolution(res)} label={`${res}p`} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-gray-400 text-center">¿Comprimir?</span>
              <div className="flex justify-center gap-2">
                <OptionButton selected={compress === true} onClick={() => setCompress(true)} label="Sí" />
                <OptionButton selected={compress === false} onClick={() => setCompress(false)} label="No" />
              </div>
            </div>
            <button onClick={transcode} disabled={compress === null} className="w-full py-4 bg-black text-white rounded-xl disabled:bg-gray-100 disabled:text-gray-300">
              Procesar
            </button>
          </div>
        )}

        {step === 'processing' && (
          <div className="w-full flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium">Procesando: {progress}%</span>
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-black transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === 'download' && (
          <div className="w-full flex flex-col items-center gap-6">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div className="flex gap-4">
              {['mp4', 'avi', 'mov'].map((fmt) => (
                <button key={fmt} onClick={() => setFormat(fmt)} className={`text-sm uppercase ${format === fmt ? 'font-bold underline' : 'text-gray-400'}`}>.{fmt}</button>
              ))}
            </div>
            <a href={outputUrl} download={`video.${format}`} className="w-full">
              <button className="w-full py-4 bg-black text-white rounded-xl flex items-center justify-center gap-2">
                Descargar <Download className="w-4 h-4" />
              </button>
            </a>
            <button onClick={resetApp} className="text-xs text-gray-400 flex items-center gap-2">
              <RefreshCcw className="w-3 h-3" /> Otro video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}