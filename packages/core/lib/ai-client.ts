export const AI_AGENT_URL = 'https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run';

export interface AIChatMessage {
  role: string;
  content: string;
}

export type AiChatResult = { ok: boolean; content?: string; error?: string };
export type AiChatTransport = (messages: AIChatMessage[]) => Promise<AiChatResult>;

// Plain fetch against the DO agent using a build-time token. Apps that need
// runtime-configurable auth (e.g. Studio's logged-in-user bearer token) call
// setAiChatTransport() during startup to swap this out.
const defaultTransport: AiChatTransport = async (messages) => {
  try {
    const token = (import.meta as any).env?.DO_AI_TOKEN;
    const res = await fetch(`${AI_AGENT_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ model: 'n/a', messages, stream: false }),
    });
    if (!res.ok) return { ok: false, error: `Agent error ${res.status}` };
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? 'No response from AI agent.';
    return { ok: true, content };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Network error' };
  }
};

let transport: AiChatTransport = defaultTransport;

// Lets a hosting app (e.g. Studio) plug in its own configured API client
// (runtime auth token, interceptors) instead of the plain fetch default.
export function setAiChatTransport(fn: AiChatTransport): void {
  transport = fn;
}

export function sendAiChat(messages: AIChatMessage[]): Promise<AiChatResult> {
  return transport(messages);
}
