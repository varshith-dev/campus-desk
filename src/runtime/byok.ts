// Bring your own key: the visitor picks the router, model and key. They stay in this browser.
// Spec section 4: origin-scoped storage, deletable, never in URLs, manifests, prompts or traces.
import type { Manifest } from './types';
import { OpenAICompatClient } from './llm';
import type { LlmClient } from './types';

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyHint: string;
}

export const PRESETS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (OpenAI-compatible endpoint)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    keyHint: 'A Gemini API key from Google AI Studio',
  },
  {
    id: 'otari',
    name: 'Mozilla Otari (hosted)',
    baseUrl: 'https://api.otari.ai/api/v1',
    model: 'alibaba/qwen3.8-flash',
    keyHint: 'An Otari API key (starts with otk_)',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    keyHint: 'An OpenAI API key',
  },
  {
    id: 'custom',
    name: 'Another OpenAI-compatible router',
    baseUrl: '',
    model: '',
    keyHint: 'The key for that router',
  },
];

export interface AiProfile {
  presetId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = 'campus-desk:ai-profile:v1';

export class ProfileStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  load(): AiProfile | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as AiProfile;
      return p && typeof p.apiKey === 'string' ? p : null;
    } catch {
      return null;
    }
  }

  save(profile: AiProfile): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  /** The visitor can always delete the stored profile (spec section 4). */
  clear(): void {
    this.storage.removeItem(STORAGE_KEY);
  }
}

export interface RouterChoice {
  kind: 'default' | 'byok';
  mock: boolean;
  baseUrl: string;
  model: string;
}

/**
 * The top site selects the active router. With a stored key it is the visitor's router.
 * Without one it is the manifest's published default. A peer manifest never reaches this function.
 */
export function chooseRouter(manifest: Manifest, profile: AiProfile | null): RouterChoice {
  if (profile && profile.apiKey) {
    const preset = PRESETS.find((p) => p.id === profile.presetId);
    return {
      kind: 'byok',
      mock: false,
      baseUrl: profile.baseUrl || preset?.baseUrl || manifest.llm_router?.byok_router || '',
      model: profile.model || preset?.model || '',
    };
  }
  const r = manifest.llm_router ?? {};
  return { kind: 'default', mock: r.mock === true, baseUrl: r.base_url ?? '', model: '' };
}

export function makeByokClient(choice: RouterChoice, apiKey: string, fetchImpl?: typeof fetch): LlmClient {
  return new OpenAICompatClient({ baseUrl: choice.baseUrl, model: choice.model, apiKey, kind: 'byok', fetchImpl });
}
