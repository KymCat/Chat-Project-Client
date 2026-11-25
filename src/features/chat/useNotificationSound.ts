import { useCallback, useEffect, useRef } from "react";

export function useNotificationSound() {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const enableSound = () => {
      if (typeof AudioContext === "undefined") return;

      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (context.state === "suspended" || context.state === "interrupted") {
        void context.resume().catch(() => {});
      }
    };

    window.addEventListener("click", enableSound);
    window.addEventListener("keydown", enableSound);
    return () => {
      window.removeEventListener("click", enableSound);
      window.removeEventListener("keydown", enableSound);
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => {});
      }
    };
  }, []);

  return useCallback(() => {
    const context = contextRef.current;
    if (!context || context.state !== "running") return;

    const startTime = context.currentTime;
    const notes = [660, 880];
    notes.forEach((frequency, index) => {
      const start = startTime + index * 0.075;
      const end = start + 0.12;
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.08, start + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.001, end);
      tone.connect(volume);
      volume.connect(context.destination);
      tone.onended = () => {
        tone.disconnect();
        volume.disconnect();
      };
      tone.start(start);
      tone.stop(end);
    });
  }, []);
}
