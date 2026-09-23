import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type Phase = 'idle' | 'connecting' | 'listening' | 'speaking';

const RATE = 24000;

export function GuestConcierge({
  token,
  preview,
  hostReply,
}: {
  token: string;
  preview: boolean;
  hostReply?: { id: string; text: string } | null;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [line, setLine] = useState('Ask about the house, the canyon, dinner, or how something works.');
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const sayRef = useRef<((text: string) => void) | null>(null);
  const spoken = useRef<string | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (!hostReply || spoken.current === hostReply.id || !sayRef.current) return;
    spoken.current = hostReply.id;
    sayRef.current(hostReply.text);
    setLine(hostReply.text);
  }, [hostReply, phase]);

  async function talk() {
    if (phase !== 'idle') {
      stopRef.current?.();
      return;
    }
    setError(null);
    setPhase('connecting');
    setLine('Connecting to Maren…');
    try {
      const session = await api.startConcierge(token, preview);
      const handle = await openVoice(session, token, preview, setPhase, setLine);
      sayRef.current = handle.say;
      stopRef.current = () => {
        handle.stop();
        stopRef.current = null;
        sayRef.current = null;
        setPhase('idle');
        setLine('Ask about the house, the canyon, dinner, or how something works.');
      };
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Maren could not start.');
    }
  }

  const live = phase !== 'idle';
  return (
    <div className="rounded-[28px] border border-[#d4b56a]/40 bg-[#d4b56a]/10 p-5" data-bot="stay-concierge">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]">Your concierge</p>
      <p className="mt-2 text-2xl text-[#f6f1e8]">Maren</p>
      <p className="mt-2 text-sm leading-relaxed text-[#d7cfc3]">{error ?? line}</p>
      <button
        type="button"
        onClick={() => void talk()}
        className={`mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold ${
          live ? 'bg-white/10 text-white' : 'bg-[#d4b56a] text-black'
        }`}
      >
        {phase === 'connecting' ? 'Connecting…' : live ? 'End conversation' : 'Talk with Maren'}
      </button>
      <p className="mt-3 text-xs text-white/45">
        She can recommend dinner and run the lights in the house. If she can’t help, she texts Brandon.
      </p>
    </div>
  );
}

function readArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function downsample(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / RATE;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function openVoice(
  started: { clientSecret: string; session: Record<string, unknown> },
  token: string,
  preview: boolean,
  setPhase: (phase: Phase) => void,
  setLine: (line: string) => void,
): Promise<{ stop: () => void; say: (text: string) => void }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=grok-voice-latest`, [
      `xai-client-secret.${started.clientSecret}`,
    ]);
    ws.binaryType = 'arraybuffer';
    let ctx: AudioContext | null = null;
    let mic: MediaStream | null = null;
    let processor: ScriptProcessorNode | null = null;
    let nextPlay = 0;
    let closed = false;
    let handed = false;
    const upcoming = () => nextPlay;
    const schedule = (at: number) => {
      nextPlay = at;
    };

    const stop = () => {
      if (closed) return;
      closed = true;
      processor?.disconnect();
      mic?.getTracks().forEach((track) => track.stop());
      void ctx?.close();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };

    ws.onerror = () => {
      stop();
      if (!handed) reject(new Error('Maren could not connect. Text or call us and we will help.'));
      else {
        setPhase('idle');
        setLine('Maren lost the connection. Tap talk to start again.');
      }
    };
    ws.onclose = () => {
      if (!closed) {
        closed = true;
        setPhase('idle');
        setLine('Maren stepped away. Tap talk to start again.');
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        playPcm(ctx, event.data as ArrayBuffer, upcoming, schedule);
        setPhase('speaking');
        return;
      }
      const message = JSON.parse(event.data) as {
        type?: string;
        name?: string;
        call_id?: string;
        arguments?: string;
        transcript?: string;
        error?: { message?: string };
      };
      if (message.type === 'error') {
        setLine(message.error?.message || 'Maren hit a snag. Try again.');
        return;
      }
      if (message.transcript) setLine(message.transcript);
      if (message.type === 'response.done' || message.type === 'input_audio_buffer.speech_started') {
        setPhase('listening');
      }
      if (message.type === 'response.function_call_arguments.done' && message.call_id && message.name) {
        const callId = message.call_id;
        const args = readArgs(message.arguments);
        const job =
          message.name === 'message_host'
            ? api.conciergeTextHost(token, String(args.note ?? ''), preview)
            : message.name === 'control_house'
              ? api.conciergeControl(
                  token,
                  {
                    name: String(args.name ?? ''),
                    action: String(args.action ?? ''),
                    brightness: typeof args.brightness === 'number' ? args.brightness : undefined,
                  },
                  preview,
                )
              : null;
        if (!job) return;
        void job.then((result) => {
          const tellGuest = 'tellGuest' in result ? result.tellGuest : 'Done.';
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) },
          }));
          ws.send(JSON.stringify({ type: 'response.create' }));
          setLine(tellGuest);
        });
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'session.update', session: started.session }));
      void navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        .then((stream) => {
          mic = stream;
          const audio = new AudioContext();
          ctx = audio;
          void audio.resume();
          const source = audio.createMediaStreamSource(stream);
          processor = audio.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (chunk) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm = downsample(chunk.inputBuffer.getChannelData(0), audio.sampleRate);
            const bytes = new ArrayBuffer(pcm.byteLength);
            new Uint8Array(bytes).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
            ws.send(bytes);
          };
          const silent = audio.createGain();
          silent.gain.value = 0;
          source.connect(processor);
          processor.connect(silent);
          silent.connect(audio.destination);
          setPhase('listening');
          setLine('Maren is listening.');
          handed = true;
          resolve({
            stop,
            say: (text) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [{
                    type: 'input_text',
                    text: `Brandon replied. Tell the guest this, warmly and briefly: ${text}`,
                  }],
                },
              }));
              ws.send(JSON.stringify({ type: 'response.create' }));
            },
          });
        })
        .catch(() => {
          stop();
          reject(new Error('The microphone needs permission before Maren can hear you.'));
        });
    };
  });
}

function playPcm(ctx: AudioContext | null, pcm: ArrayBuffer, getNext: () => number, setNext: (at: number) => void) {
  if (!ctx) return;
  const samples = new Int16Array(pcm);
  const buffer = ctx.createBuffer(1, samples.length, RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) channel[i] = (samples[i] ?? 0) / 32768;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const start = Math.max(ctx.currentTime, getNext());
  source.start(start);
  setNext(start + buffer.duration);
}
