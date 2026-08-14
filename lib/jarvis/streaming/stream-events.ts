export type JarvisStreamThreadEvent = {
  type: "thread";
  threadId: string;
};

export type JarvisStreamDeltaEvent = {
  type: "delta";
  delta: string;
};

export type JarvisStreamResetEvent = {
  type: "reset";
};

export type JarvisStreamStatusEvent = {
  type: "status";
  status: "working";
};

export type JarvisStreamDoneEvent = {
  type: "done";
  threadId: string;
  reply: string;
  requestId: string;
};

export type JarvisStreamErrorEvent = {
  type: "error";
  code: string;
  message: string;
  requestId?: string;
};

export type JarvisStreamEvent =
  | JarvisStreamThreadEvent
  | JarvisStreamDeltaEvent
  | JarvisStreamResetEvent
  | JarvisStreamStatusEvent
  | JarvisStreamDoneEvent
  | JarvisStreamErrorEvent;

export const JARVIS_STREAM_CONTENT_TYPE =
  "application/x-ndjson; charset=utf-8";
