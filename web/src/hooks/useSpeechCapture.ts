import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type SpeechState = 'idle' | 'listening' | 'processing';

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechCapture(onTranscript: (text: string) => void, onError: (msg: string) => void) {
  const [state, setState] = useState<SpeechState>('idle');
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      mediaRef.current?.stop();
    };
  }, []);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return false;

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? '';
      if (text) onTranscript(text);
      setState('idle');
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') onError(`Microphone error: ${e.error}`);
      setState('idle');
    };
    rec.onend = () => setState('idle');
    recognitionRef.current = rec;
    rec.start();
    setState('listening');
    return true;
  }, [onTranscript, onError]);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setState('processing');
        stream.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
          const result = await api.agentTranscribe({
            audioBase64: btoa(binary),
            mimeType: 'audio/webm',
          });
          if (result.text) onTranscript(result.text);
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Transcription failed');
        } finally {
          setState('idle');
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setState('listening');
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 8000);
    } catch {
      onError('Microphone permission denied. Enable mic in browser settings.');
      setState('idle');
    }
  }, [onTranscript, onError]);

  const toggle = useCallback(() => {
    if (state === 'listening') {
      recognitionRef.current?.stop();
      mediaRef.current?.stop();
      setState('idle');
      return;
    }
    if (state === 'processing') return;

    if (!startWebSpeech()) {
      void startMediaRecorder();
    }
  }, [state, startWebSpeech, startMediaRecorder]);

  return { state, toggle, supported: Boolean(getSpeechRecognition()) || Boolean(navigator.mediaDevices) };
}
