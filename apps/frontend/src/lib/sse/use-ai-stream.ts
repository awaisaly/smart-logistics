import { useState } from "react";

export function useAiStream() {
  const [chunks, setChunks] = useState<string[]>([]);

  function connect(prompt: string) {
    const source = new EventSource(`/ai/assistant/stream?prompt=${encodeURIComponent(prompt)}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; text?: string };
        if (payload.text) {
          setChunks((prev) => [...prev, payload.text as string]);
        }
        if (payload.type === "done") {
          source.close();
        }
      } catch {
        source.close();
      }
    };
  }

  return { chunks, connect };
}
