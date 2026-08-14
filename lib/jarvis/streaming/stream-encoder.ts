import type { JarvisStreamEvent } from "@/lib/jarvis/streaming/stream-events";

export function encodeJarvisStreamEvent(event: JarvisStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function createJarvisStreamEncoder(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder = new TextEncoder(),
): (event: JarvisStreamEvent) => void {
  return (event: JarvisStreamEvent) => {
    controller.enqueue(encoder.encode(encodeJarvisStreamEvent(event)));
  };
}
