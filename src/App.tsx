/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Languages, 
  Settings, 
  Mic, 
  Volume2, 
  Copy, 
  Trash2, 
  ArrowRightLeft, 
  Sun, 
  Moon, 
  Check, 
  AlertCircle,
  Loader2,
  X,
  Save,
  Globe,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// Types
type APIProvider = 'gemini' | 'openai' | 'openrouter' | 'xai' | 'groq';
type TTSProvider = 'gemini' | 'puter' | 'web';
type GeminiVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
type VoiceGender = 'male' | 'female';
type VoiceStyle = 'natural' | 'storyteller';

interface AppSettings {
  apiKeys: Record<APIProvider, string>;
  provider: APIProvider;
  selectedModels: Record<APIProvider, string>;
  ttsProvider: TTSProvider;
  geminiVoice: GeminiVoice;
  voiceGender: VoiceGender;
  voiceStyle: VoiceStyle;
  defaultOutputLang: string;
  theme: 'light' | 'dark';
}

const PROVIDER_MODELS: Record<APIProvider, { id: string; name: string; isFree?: boolean }[]> = {
  gemini: [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', isFree: true },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', isFree: true },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', isFree: true },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
  ],
  openrouter: [
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', isFree: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', isFree: true },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', isFree: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  ],
  xai: [
    { id: 'grok-beta', name: 'Grok Beta' },
    { id: 'grok-2-1212', name: 'Grok 2' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', isFree: true },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', isFree: true },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', isFree: true },
  ],
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKeys: {
    gemini: '',
    openai: '',
    openrouter: '',
    xai: '',
    groq: '',
  },
  provider: 'gemini',
  selectedModels: {
    gemini: 'gemini-3-flash-preview',
    openai: 'gpt-4o-mini',
    openrouter: 'google/gemini-2.0-flash-001',
    xai: 'grok-beta',
    groq: 'llama-3.3-70b-versatile',
  },
  ttsProvider: 'puter',
  geminiVoice: 'Zephyr', 
  voiceGender: 'female',
  voiceStyle: 'natural',
  defaultOutputLang: 'Algerian Dialect (Darija)',
  theme: 'dark',
};

const LANGUAGES = [
  'Algerian Dialect (Darija)',
  'Arabic (Standard)',
  'English',
  'French',
  'Spanish',
  'German',
  'Italian',
  'Turkish',
];

export default function App() {
  // State
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('Auto Detect');
  const [targetLang, setTargetLang] = useState('Algerian Dialect (Darija)');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('dz-dialect-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration for old settings format
        if (parsed.apiKey !== undefined && !parsed.apiKeys) {
          const provider = parsed.provider || 'gemini';
          parsed.apiKeys = {
            ...DEFAULT_SETTINGS.apiKeys,
            [provider]: parsed.apiKey
          };
          delete parsed.apiKey;
        }
        return { 
          ...DEFAULT_SETTINGS, 
          ...parsed,
          selectedModels: {
            ...DEFAULT_SETTINGS.selectedModels,
            ...(parsed.selectedModels || {})
          }
        };
      }
    } catch (err) {
      console.error('Failed to parse settings:', err);
    }
    return DEFAULT_SETTINGS;
  });
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isPuterReady, setIsPuterReady] = useState(false);
  const [keyStatuses, setKeyStatuses] = useState<Record<APIProvider, 'idle' | 'validating' | 'valid' | 'invalid'>>({
    gemini: 'idle',
    openai: 'idle',
    openrouter: 'idle',
    xai: 'idle',
    groq: 'idle',
  });

  // Refs
  const recognitionRef = useRef<any>(null);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [settings.theme]);

  // Save settings
  const saveSettings = (newSettings: AppSettings) => {
    try {
      setSettings(newSettings);
      localStorage.setItem('dz-dialect-settings', JSON.stringify(newSettings));
    } catch (err) {
      console.error('Failed to save settings to localStorage:', err);
    }
  };

  const toggleTheme = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    saveSettings({ ...settings, theme: newTheme });
  };

  // Mouse Button Shortcuts
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Button 3: Back button on mouse
      // Button 4: Forward button on mouse
      
      if (e.button === 3) { // Mouse Back
        e.preventDefault();
        handleSwap();
      } else if (e.button === 4) { // Mouse Forward
        e.preventDefault();
        handleTranslate();
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) { // Middle Click
        const target = e.target as HTMLElement;
        // If middle clicking on output area, copy it
        if (target.closest('.output-area') && outputText) {
          navigator.clipboard.writeText(outputText);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('auxclick', handleAuxClick);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('auxclick', handleAuxClick);
    };
  }, [sourceLang, targetLang, inputText, outputText]); // Dependencies for handlers

  // Audio Unlock for Browser Policies
  useEffect(() => {
    const unlockAudio = () => {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('AudioContext unlocked');
            ctx.close();
          });
        } else {
          ctx.close();
        }
      }
      
      // Unlock HTMLAudioElement (used by Puter)
      const audio = new Audio();
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
      audio.play().catch(() => {});

      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Puter Initialization
  useEffect(() => {
    const initPuter = async () => {
      const puter = (window as any).puter;
      if (puter) {
        try {
          if (puter.ready) await puter.ready();
          setIsPuterReady(true);
          console.log('Puter.js is ready');
          
          // Log available voices for debugging
          if (puter.ai && puter.ai.txt2speech && puter.ai.txt2speech.getVoices) {
            const voices = await puter.ai.txt2speech.getVoices();
            console.log('Available Puter Voices:', voices);
          }
        } catch (err) {
          console.error('Puter.js failed to initialize:', err);
        }
      } else {
        // Check again in 1 second if not loaded yet
        setTimeout(initPuter, 1000);
      }
    };
    initPuter();
  }, []);

  // Translation Logic
  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    
    // Get API Key with fallback to environment variables
    const getApiKey = (provider: APIProvider) => {
      if (settings.apiKeys[provider]) return settings.apiKeys[provider];
      
      // Fallback to environment variables
      switch (provider) {
        case 'gemini': return process.env.GEMINI_API_KEY || '';
        case 'groq': return ((import.meta as any).env.VITE_GROQ_API_KEY as string) || '';
        case 'xai': return ((import.meta as any).env.VITE_XAI_API_KEY as string) || '';
        case 'openai': return ((import.meta as any).env.VITE_OPENAI_API_KEY as string) || '';
        case 'openrouter': return ((import.meta as any).env.VITE_OPENROUTER_API_KEY as string) || '';
        default: return '';
      }
    };

    const apiKeyToUse = getApiKey(settings.provider);
    
    if (!apiKeyToUse) {
      setError(`API Key for ${settings.provider.toUpperCase()} is missing. Please add it in settings.`);
      setIsSettingsOpen(true);
      return;
    }

    setIsTranslating(true);
    setError(null);

    const isTargetDarija = targetLang === 'Algerian Dialect (Darija)';
    let attempts = 0;
    const maxAttempts = 3;
    let finalOutput = '';

    try {
      while (attempts < maxAttempts) {
        let text = '';
        const systemPrompt = `Translate from ${sourceLang} to ${targetLang}.
        STRICT RULES:
        - Output ONLY the translated sentence.
        - Exactly ONE sentence.
        - NO explanations, NO lists, NO alternatives.
        - NO formatting (no markdown, no bold, no stars).
        - NO punctuation at the end (no dots, no commas).
        ${isTargetDarija ? `
        - Use ONLY Arabic script (no Latin letters, no French/English letters, no Arabizi).
        - Even if using a French-origin word, write it in Arabic letters (e.g., write 'طوموبيل' not 'voiture').
        - Use casual, natural Algerian Darija.
        - Avoid formal Arabic completely.
        ` : ''}
        - No introductory text.`;

        if (settings.provider === 'gemini') {
          const genAI = new GoogleGenAI({ apiKey: apiKeyToUse });
          const response = await genAI.models.generateContent({
            model: settings.selectedModels.gemini,
            contents: inputText,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1 + (attempts * 0.1),
            }
          });
          text = (response.text || '').trim();
        } else {
          const apiEndpoints: Record<APIProvider, string> = {
            gemini: '',
            groq: 'https://api.groq.com/openai/v1/chat/completions',
            xai: 'https://api.x.ai/v1/chat/completions',
            openai: 'https://api.openai.com/v1/chat/completions',
            openrouter: 'https://openrouter.ai/api/v1/chat/completions'
          };

          const response = await fetch(apiEndpoints[settings.provider], {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKeyToUse}`,
              ...(settings.provider === 'openrouter' ? {
                'HTTP-Referer': window.location.origin,
                'X-Title': 'DZ Dialect'
              } : {})
            },
            body: JSON.stringify({
              model: settings.selectedModels[settings.provider],
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: inputText }
              ],
              temperature: 0.1 + (attempts * 0.1)
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const apiError = errorData.error?.message || errorData.error || response.statusText;
            throw new Error(`${settings.provider.toUpperCase()} API request failed: ${apiError}`);
          }
          const data = await response.json();
          text = (data.choices[0].message.content || '').trim();
        }
        
        // Check for Latin characters if target is Darija
        if (isTargetDarija && /[a-zA-Z]/.test(text)) {
          attempts++;
          if (attempts === maxAttempts) {
            finalOutput = text;
          }
          continue;
        }

        finalOutput = text;
        break;
      }
      
      setOutputText(finalOutput || 'Translation failed.');
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || 'Unknown error';
      setError(`Translation failed (${settings.provider.toUpperCase()}): ${errorMessage}. Please check your internet connection and API key.`);
    } finally {
      setIsTranslating(false);
    }
  };

  // Swap Languages
  const handleSwap = () => {
    const temp = sourceLang === 'Auto Detect' ? 'English' : sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
    setInputText(outputText);
    setOutputText(inputText);
  };

  const handleSmartKeyDetect = (key: string) => {
    if (!key.trim()) return;
    
    let detectedProvider: APIProvider | null = null;
    const cleanKey = key.trim();

    if (cleanKey.startsWith('gsk_')) {
      detectedProvider = 'groq';
    } else if (cleanKey.startsWith('xai-')) {
      detectedProvider = 'xai';
    } else if (cleanKey.startsWith('sk-or-')) {
      detectedProvider = 'openrouter';
    } else if (cleanKey.startsWith('sk-')) {
      detectedProvider = 'openai';
    } else if (cleanKey.length >= 30 && /^[A-Za-z0-9_-]+$/.test(cleanKey)) {
      // Likely Gemini if it's long and has no specific prefix
      detectedProvider = 'gemini';
    }

    if (detectedProvider) {
      setSettings(prev => ({
        ...prev,
        provider: detectedProvider!,
        apiKeys: {
          ...prev.apiKeys,
          [detectedProvider!]: cleanKey
        }
      }));
      setError(null);
    }
  };

  // Speech to Text
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition is not supported in your browser.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-DZ'; // Default to Arabic/Algerian
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + ' ' + transcript);
      };

      recognition.onerror = (event: any) => {
        console.error(event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      setIsRecording(true);
      recognitionRef.current = recognition;
    }
  };

  // Text to Speech
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Pre-load voices for Web Speech API
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleSpeak = async (text: string) => {
    if (!text) return;
    
    if (isSpeaking) {
      // Stop everything
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
      }
      if (currentAudioContextRef.current) {
        currentAudioContextRef.current.close();
        currentAudioContextRef.current = null;
      }
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    
    const apiKeyToUse = settings.apiKeys.gemini || (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const isArabicText = /[\u0600-\u06FF]/.test(text);
    
    setIsSpeaking(true);

    const stopSpeaking = () => setIsSpeaking(false);

    // 1. Try Puter TTS (Free & High Quality)
    if (settings.ttsProvider === 'puter') {
      const puter = (window as any).puter;
      console.log('Attempting Puter TTS...', { isPuterReady, hasPuter: !!puter });
      
      if (puter && puter.ai && puter.ai.txt2speech) {
        try {
          // 'Zeina' is the high-quality Arabic female voice in Amazon Polly (used by Puter)
          // 'Maged' is the high-quality Arabic male voice
          const voice = isArabicText 
            ? (settings.voiceGender === 'female' ? 'Zeina' : 'Maged')
            : undefined;
          
          console.log('Calling puter.ai.txt2speech with voice:', voice);
          
          let audio;
          try {
            // Try with voice first
            audio = await puter.ai.txt2speech(text, voice);
          } catch (e) {
            console.warn('Puter TTS with voice failed, trying without voice:', e);
            audio = await puter.ai.txt2speech(text);
          }
          
          if (audio) {
            console.log('Puter audio object received:', audio);
            currentAudioRef.current = audio;
            audio.onended = () => {
              console.log('Puter audio ended');
              stopSpeaking();
            };
            audio.onerror = (e: any) => {
              console.error('Puter audio runtime error:', e);
              stopSpeaking();
              currentAudioRef.current = null;
              // Fallback
              if (apiKeyToUse) handleGeminiTTS(text, apiKeyToUse, isArabicText, stopSpeaking);
              else handleWebSpeechTTS(text, isArabicText, stopSpeaking);
            };
            
            console.log('Playing Puter audio...');
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch(err => {
                console.error('Puter audio.play() failed:', err);
                // Fallback if play() fails (e.g. autoplay block)
                if (apiKeyToUse) handleGeminiTTS(text, apiKeyToUse, isArabicText, stopSpeaking);
                else handleWebSpeechTTS(text, isArabicText, stopSpeaking);
              });
            }
            return; // Success
          } else {
            console.error('Puter txt2speech returned null/undefined');
          }
        } catch (err) {
          console.error('Puter TTS top-level error:', err);
        }
      } else {
        console.warn('Puter.js or txt2speech API not available');
      }
    }

    // 2. Try Gemini TTS
    if ((settings.ttsProvider === 'gemini' || settings.ttsProvider === 'puter') && apiKeyToUse) {
      const success = await handleGeminiTTS(text, apiKeyToUse, isArabicText, stopSpeaking);
      if (success) return;
    }

    // 3. Fallback to Web Speech API
    handleWebSpeechTTS(text, isArabicText, stopSpeaking);
  };

  const handleGeminiTTS = async (text: string, apiKey: string, isArabic: boolean, onEnd: () => void): Promise<boolean> => {
    try {
      const genAI = new GoogleGenAI({ apiKey });
      
      // Refined prompt for better Algerian/Arabic dialect
      const styleInstruction = settings.voiceStyle === 'storyteller' 
        ? "Read this text like a professional voiceover artist or a storyteller. Use dramatic pauses, clear articulation, and deep emotion."
        : "Read this text naturally and conversationally, like a real person talking to a friend.";

      const prompt = isArabic 
        ? `Act as a native Algerian speaker from the heart of Algiers. ${styleInstruction} Read this text in the Algerian Dialect (Darija) with the authentic local accent, intonation, and soul. Use the correct pronunciation for letters like 'q' (often pronounced as 'g' or 'q' depending on the word) and 'j'. Make it sound 100% Algerian: ${text}`
        : `${styleInstruction} Read this naturally in ${targetLang}: ${text}`;

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: settings.geminiVoice }, 
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const audioContext = new AudioContextClass({ sampleRate: 24000 });
        currentAudioContextRef.current = audioContext;
        
        // Ensure the byte length is a multiple of 2 for Int16Array
        const alignedLength = Math.floor(bytes.length / 2) * 2;
        const pcmData = new Int16Array(bytes.buffer, 0, alignedLength / 2);
        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          float32Data[i] = pcmData[i] / 32768;
        }

        const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        currentSourceRef.current = source;
        source.onended = () => {
          onEnd();
          audioContext.close();
          if (currentAudioContextRef.current === audioContext) currentAudioContextRef.current = null;
          if (currentSourceRef.current === source) currentSourceRef.current = null;
        };
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        source.start();
        return true;
      }
    } catch (err) {
      console.error('Gemini TTS failed:', err);
    }
    return false;
  };

  const handleWebSpeechTTS = (text: string, isArabic: boolean, onEnd: () => void) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    const langMap: Record<string, string> = {
      'Algerian Dialect (Darija)': 'ar',
      'Arabic (Standard)': 'ar',
      'English': 'en',
      'French': 'fr',
      'Spanish': 'es',
      'German': 'de',
      'Italian': 'it',
      'Turkish': 'tr',
    };

    const targetLangCode = isArabic ? 'ar' : (langMap[targetLang] || 'en');
    
    // Prioritize high-quality Arabic voices if available
    const bestVoice = voices.find(v => v.lang.startsWith(targetLangCode) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))) 
                   || voices.find(v => v.lang.startsWith(targetLangCode) && v.localService)
                   || voices.find(v => v.lang.startsWith(targetLangCode));

    if (bestVoice) utterance.voice = bestVoice;
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    
    window.speechSynthesis.speak(utterance);
  };

  // Copy to Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(outputText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Clear
  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  // API Key Validation
  const validateKey = async (provider: APIProvider, key: string) => {
    if (!key) {
      setKeyStatuses(prev => ({ ...prev, [provider]: 'idle' }));
      return;
    }

    setKeyStatuses(prev => ({ ...prev, [provider]: 'validating' }));

    try {
      if (provider === 'gemini') {
        const genAI = new GoogleGenAI({ apiKey: key });
        await genAI.models.generateContent({
          model: settings.selectedModels.gemini,
          contents: "hi",
          config: { maxOutputTokens: 1 }
        });
      } else {
        const apiEndpoints: Record<APIProvider, string> = {
          gemini: '',
          groq: 'https://api.groq.com/openai/v1/chat/completions',
          xai: 'https://api.x.ai/v1/chat/completions',
          openai: 'https://api.openai.com/v1/chat/completions',
          openrouter: 'https://openrouter.ai/api/v1/chat/completions'
        };

        const response = await fetch(apiEndpoints[provider], {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            ...(provider === 'openrouter' ? {
              'HTTP-Referer': window.location.origin,
              'X-Title': 'DZ Dialect'
            } : {})
          },
          body: JSON.stringify({
            model: settings.selectedModels[provider],
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1
          })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const apiError = errorData.error?.message || errorData.error || response.statusText;
          throw new Error(apiError);
        }
      }
      setKeyStatuses(prev => ({ ...prev, [provider]: 'valid' }));
    } catch (err) {
      setKeyStatuses(prev => ({ ...prev, [provider]: 'invalid' }));
    }
  };

  // Validate all keys on mount or settings open
  useEffect(() => {
    if (isSettingsOpen) {
      (Object.entries(settings.apiKeys) as [APIProvider, string][]).forEach(([provider, key]) => {
        if (key) validateKey(provider, key);
      });
    }
  }, [isSettingsOpen]);

  return (
    <div className="min-h-screen bg-transparent text-[#1A1C1E] dark:text-[#E2E2E6] transition-colors duration-300 font-sans selection:bg-blue-500/30">
      <div className="mesh-bg" />
      {/* Top Bar */}
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 sticky top-0 bg-white/80 dark:bg-[#0F1115]/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 flex items-center">
            <div className="flex items-center gap-2">
              <Languages className="text-blue-500" size={28} />
              <span className="text-xl font-black tracking-tighter text-gray-900 dark:text-white">
                DZ <span className="text-blue-500">Dialect</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter flex items-center">
              <span className="text-[#006233]">DZ</span>
              <span className="mx-1 text-gray-400 dark:text-gray-500">|</span>
              <span className="text-[#D21034]">Dialect</span>
            </h1>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
              <Globe size={14} />
              Service
            </div>
            <select 
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value as APIProvider })}
              className="bg-transparent text-sm font-medium px-2 py-1 outline-none cursor-pointer pr-6 appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '12px' }}
            >
              <option value="gemini" className="bg-white dark:bg-[#1A1D23]">Gemini</option>
              <option value="groq" className="bg-white dark:bg-[#1A1D23]">Groq</option>
              <option value="xai" className="bg-white dark:bg-[#1A1D23]">XAI</option>
              <option value="openai" className="bg-white dark:bg-[#1A1D23]">OpenAI</option>
              <option value="openrouter" className="bg-white dark:bg-[#1A1D23]">OpenRouter</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
              <Cpu size={14} />
              Model
            </div>
            <select 
              value={settings.selectedModels[settings.provider]}
              onChange={(e) => setSettings({
                ...settings,
                selectedModels: {
                  ...settings.selectedModels,
                  [settings.provider]: e.target.value
                }
              })}
              className="bg-transparent text-sm font-medium px-2 py-1 outline-none cursor-pointer pr-6 appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '12px' }}
            >
              {PROVIDER_MODELS[settings.provider].map(model => (
                <option key={model.id} value={model.id} className="bg-white dark:bg-[#1A1D23]">
                  {model.isFree ? '🎁 ' : ''}{model.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={settings.theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {settings.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 md:p-12">
        {/* Mobile Selectors */}
        <div className="md:hidden mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
              <Globe size={14} />
              Service
            </div>
            <select 
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value as APIProvider })}
              className="flex-1 bg-transparent text-sm font-medium px-2 py-1 outline-none cursor-pointer pr-6 appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '12px' }}
            >
              <option value="gemini" className="bg-white dark:bg-[#1A1D23]">Gemini</option>
              <option value="groq" className="bg-white dark:bg-[#1A1D23]">Groq</option>
              <option value="xai" className="bg-white dark:bg-[#1A1D23]">XAI</option>
              <option value="openai" className="bg-white dark:bg-[#1A1D23]">OpenAI</option>
              <option value="openrouter" className="bg-white dark:bg-[#1A1D23]">OpenRouter</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
              <Cpu size={14} />
              Model
            </div>
            <select 
              value={settings.selectedModels[settings.provider]}
              onChange={(e) => setSettings({
                ...settings,
                selectedModels: {
                  ...settings.selectedModels,
                  [settings.provider]: e.target.value
                }
              })}
              className="flex-1 bg-transparent text-sm font-medium px-2 py-1 outline-none cursor-pointer pr-6 appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '12px' }}
            >
              {PROVIDER_MODELS[settings.provider].map(model => (
                <option key={model.id} value={model.id} className="bg-white dark:bg-[#1A1D23]">
                  {model.isFree ? '🎁 ' : ''}{model.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
          {/* Input Section */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-white dark:bg-[#1A1D23] p-2 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="relative flex items-center">
                <select 
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="bg-transparent pl-4 pr-8 py-2 outline-none font-medium cursor-pointer appearance-none hover:text-blue-600 transition-colors"
                >
                  <option value="Auto Detect">Auto Detect</option>
                  {LANGUAGES.map(lang => (
                    <option key={lang} value={lang} className="dark:bg-[#1A1D23]">{lang}</option>
                  ))}
                </select>
                <div className="absolute right-2 pointer-events-none text-gray-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleRecording}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    isRecording ? "bg-red-500 text-white animate-pulse" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                  title="Voice Input"
                >
                  <Mic size={18} />
                </button>
                <button 
                  onClick={handleClear}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Clear"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="relative group">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type or paste text here..."
                className="w-full h-64 md:h-80 p-6 bg-white dark:bg-[#1A1D23] rounded-3xl border border-gray-200 dark:border-gray-800 focus:border-[#006233] dark:focus:border-[#00a857] outline-none resize-none text-lg leading-relaxed shadow-sm transition-all"
              />
              <div className="absolute bottom-4 right-4 text-xs text-gray-400">
                {inputText.length} characters
              </div>
            </div>
          </section>

          {/* Swap Button (Desktop) */}
          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <button 
              onClick={handleSwap}
              className="w-12 h-12 bg-[#006233] hover:bg-[#004d28] text-white rounded-full flex items-center justify-center shadow-xl shadow-green-900/30 transition-transform hover:rotate-180 duration-500 border-2 border-white/20"
            >
              <ArrowRightLeft size={20} />
            </button>
          </div>

          {/* Swap Button (Mobile) */}
          <div className="flex lg:hidden justify-center -my-3 z-10">
            <button 
              onClick={handleSwap}
              className="w-10 h-10 bg-[#006233] text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white/20"
            >
              <ArrowRightLeft size={18} className="rotate-90" />
            </button>
          </div>

          {/* Output Section */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-white dark:bg-[#1A1D23] p-2 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="relative flex items-center">
                <select 
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="bg-transparent pl-4 pr-8 py-2 outline-none font-medium cursor-pointer appearance-none hover:text-blue-600 transition-colors"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang} value={lang} className="dark:bg-[#1A1D23]">{lang}</option>
                  ))}
                </select>
                <div className="absolute right-2 pointer-events-none text-gray-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
              <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleSpeak(outputText)}
                    className={cn(
                      "px-3 py-2 rounded-xl transition-all flex items-center gap-2",
                      isSpeaking 
                        ? "bg-red-100 dark:bg-red-900/30 text-[#D21034] animate-pulse" 
                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-[#006233] dark:text-[#00a857]"
                    )}
                    title={isSpeaking ? "Stop" : "Listen Voiceover"}
                  >
                    {isSpeaking ? <Volume2 size={18} className="animate-bounce" /> : <Volume2 size={18} />}
                    {!isSpeaking && <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Voiceover</span>}
                  </button>
                <button 
                  onClick={handleCopy}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors relative"
                  title="Copy"
                >
                  {copySuccess ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="relative">
              <div className={cn(
                "w-full h-64 md:h-80 p-6 bg-white dark:bg-[#1A1D23] rounded-3xl border border-gray-200 dark:border-gray-800 text-lg leading-relaxed shadow-sm overflow-auto whitespace-pre-wrap output-area",
                !outputText && "text-gray-400 italic"
              )}>
                {isTranslating ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="w-8 h-8 text-[#006233] animate-spin" />
                    <p className="text-sm font-medium animate-pulse">Translating to {targetLang}...</p>
                  </div>
                ) : (
                  outputText || "Translation will appear here..."
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Action Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleTranslate}
            disabled={isTranslating || !inputText.trim()}
            className="px-12 py-4 bg-gradient-to-r from-[#006233] to-[#006233] hover:from-[#004d28] hover:to-[#004d28] disabled:bg-gray-400 text-white rounded-2xl font-bold text-lg shadow-xl shadow-green-900/20 transition-all active:scale-95 flex items-center gap-3 border-b-4 border-[#D21034]"
          >
            {isTranslating ? <Loader2 className="animate-spin" /> : <Languages />}
            Translate
          </button>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400"
            >
              <AlertCircle size={20} />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white dark:bg-[#1A1D23] rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings size={20} className="text-blue-600" />
                  App Settings
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Appearance</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSettings({ ...settings, theme: 'light' })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 transition-all",
                        settings.theme === 'light' 
                          ? "bg-blue-50 border-blue-200 text-blue-600 font-bold" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500"
                      )}
                    >
                      <Sun size={18} />
                      Light
                    </button>
                    <button 
                      onClick={() => setSettings({ ...settings, theme: 'dark' })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 transition-all",
                        settings.theme === 'dark' 
                          ? "bg-blue-900/20 border-blue-800 text-blue-400 font-bold" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500"
                      )}
                    >
                      <Moon size={18} />
                      Dark
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active API Provider</label>
                  <div className="relative flex items-center">
                    <select 
                      value={settings.provider}
                      onChange={(e) => setSettings({ ...settings, provider: e.target.value as APIProvider })}
                      className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    >
                      <option value="gemini">Google Gemini (Recommended)</option>
                      <option value="groq">Groq (Fastest)</option>
                      <option value="xai">XAI (Grok)</option>
                      <option value="openai">OpenAI (GPT-4o Mini)</option>
                      <option value="openrouter">OpenRouter (Gemini 2.0 Flash)</option>
                    </select>
                    <div className="absolute right-4 pointer-events-none text-gray-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Model for {settings.provider.toUpperCase()}</label>
                  <div className="relative flex items-center">
                    <select 
                      value={settings.selectedModels[settings.provider]}
                      onChange={(e) => setSettings({
                        ...settings,
                        selectedModels: {
                          ...settings.selectedModels,
                          [settings.provider]: e.target.value
                        }
                      })}
                      className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    >
                      {PROVIDER_MODELS[settings.provider].map(model => (
                        <option key={model.id} value={model.id}>
                          {model.isFree ? '🎁 ' : ''}{model.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 pointer-events-none text-gray-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider block">API Keys Configuration</label>
                  </div>

                  {/* Smart Detection Input */}
                  <div className="p-4 bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-2xl space-y-2">
                    <label className="text-xs font-bold text-[#006233] dark:text-[#00a857] flex items-center gap-1">
                      <Globe size={12} />
                      Smart Key Detection
                    </label>
                    <input 
                      type="password"
                      placeholder="Paste any API key here to auto-detect..."
                      onChange={(e) => handleSmartKeyDetect(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-[#0F1115] border border-blue-200 dark:border-blue-800 rounded-xl outline-none focus:border-blue-500 text-sm"
                    />
                    <p className="text-[10px] text-blue-500/70">Paste a key to automatically set the provider and key.</p>
                  </div>
                  
                  {/* Gemini Key */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 ml-1">Google Gemini Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={settings.apiKeys.gemini}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({ 
                            ...settings, 
                            apiKeys: { ...settings.apiKeys, gemini: val } 
                          });
                          validateKey('gemini', val);
                        }}
                        placeholder="Enter Gemini API key..."
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 pr-10 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {keyStatuses.gemini === 'validating' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {keyStatuses.gemini === 'valid' && <Check size={14} className="text-green-500" />}
                        {keyStatuses.gemini === 'invalid' && <X size={14} className="text-red-500" />}
                        {keyStatuses.gemini === 'idle' && !settings.apiKeys.gemini && <AlertCircle size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Groq Key */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 ml-1">Groq API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={settings.apiKeys.groq}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({ 
                            ...settings, 
                            apiKeys: { ...settings.apiKeys, groq: val } 
                          });
                          validateKey('groq', val);
                        }}
                        placeholder="Enter Groq API key..."
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 pr-10 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {keyStatuses.groq === 'validating' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {keyStatuses.groq === 'valid' && <Check size={14} className="text-green-500" />}
                        {keyStatuses.groq === 'invalid' && <X size={14} className="text-red-500" />}
                        {keyStatuses.groq === 'idle' && !settings.apiKeys.groq && <AlertCircle size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* XAI Key */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 ml-1">XAI (Grok) API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={settings.apiKeys.xai}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({ 
                            ...settings, 
                            apiKeys: { ...settings.apiKeys, xai: val } 
                          });
                          validateKey('xai', val);
                        }}
                        placeholder="Enter XAI API key..."
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 pr-10 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {keyStatuses.xai === 'validating' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {keyStatuses.xai === 'valid' && <Check size={14} className="text-green-500" />}
                        {keyStatuses.xai === 'invalid' && <X size={14} className="text-red-500" />}
                        {keyStatuses.xai === 'idle' && !settings.apiKeys.xai && <AlertCircle size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* OpenAI Key */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 ml-1">OpenAI API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={settings.apiKeys.openai}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({ 
                            ...settings, 
                            apiKeys: { ...settings.apiKeys, openai: val } 
                          });
                          validateKey('openai', val);
                        }}
                        placeholder="Enter OpenAI API key..."
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 pr-10 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {keyStatuses.openai === 'validating' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {keyStatuses.openai === 'valid' && <Check size={14} className="text-green-500" />}
                        {keyStatuses.openai === 'invalid' && <X size={14} className="text-red-500" />}
                        {keyStatuses.openai === 'idle' && !settings.apiKeys.openai && <AlertCircle size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* OpenRouter Key */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 ml-1">OpenRouter API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={settings.apiKeys.openrouter}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({ 
                            ...settings, 
                            apiKeys: { ...settings.apiKeys, openrouter: val } 
                          });
                          validateKey('openrouter', val);
                        }}
                        placeholder="Enter OpenRouter API key..."
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 pr-10 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {keyStatuses.openrouter === 'validating' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {keyStatuses.openrouter === 'valid' && <Check size={14} className="text-green-500" />}
                        {keyStatuses.openrouter === 'invalid' && <X size={14} className="text-red-500" />}
                        {keyStatuses.openrouter === 'idle' && !settings.apiKeys.openrouter && <AlertCircle size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 italic">Keys are stored locally on your device.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Text-to-Speech Engine</label>
                    <div className="flex items-center gap-3">
                      {settings.ttsProvider === 'puter' && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            <div className={cn("w-1.5 h-1.5 rounded-full", isPuterReady ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-amber-500 animate-pulse")} />
                            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                              {isPuterReady ? "Puter Ready" : "Initializing..."}
                            </span>
                          </div>
                          {!isPuterReady && (
                            <button 
                              onClick={() => {
                                const puter = (window as any).puter;
                                if (puter && puter.ready) {
                                  puter.ready().then(() => setIsPuterReady(true)).catch(console.error);
                                }
                              }}
                              className="text-[10px] text-blue-500 hover:underline"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      )}
                      <button 
                        onClick={() => handleSpeak(settings.defaultOutputLang === 'English' ? "Hello, this is a voice test." : "مرحباً، هذا اختبار للصوت.")}
                        className={cn(
                          "text-xs font-medium flex items-center gap-1 transition-colors",
                          isSpeaking ? "text-red-500 hover:text-red-600" : "text-blue-500 hover:text-blue-600"
                        )}
                      >
                        {isSpeaking ? <Volume2 size={12} className="animate-pulse" /> : <Volume2 size={12} />}
                        {isSpeaking ? "Stop Test" : "Test Voice"}
                      </button>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <select 
                      value={settings.ttsProvider}
                      onChange={(e) => setSettings({ ...settings, ttsProvider: e.target.value as TTSProvider })}
                      className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    >
                      <option value="puter">Puter (Free & Natural)</option>
                      <option value="gemini">Google Gemini (High Quality)</option>
                      <option value="web">Web Speech API (Browser Default)</option>
                    </select>
                    <div className="absolute right-4 pointer-events-none text-gray-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Voice Gender</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSettings({ 
                        ...settings, 
                        voiceGender: 'female',
                        geminiVoice: 'Zephyr'
                      })}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                        settings.voiceGender === 'female' 
                          ? "bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-400" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      <div className={cn("w-2 h-2 rounded-full", settings.voiceGender === 'female' ? "bg-pink-500" : "bg-gray-300")} />
                      Female (Recommended)
                    </button>
                    <button
                      onClick={() => setSettings({ 
                        ...settings, 
                        voiceGender: 'male',
                        geminiVoice: 'Puck'
                      })}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                        settings.voiceGender === 'male' 
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      <div className={cn("w-2 h-2 rounded-full", settings.voiceGender === 'male' ? "bg-blue-500" : "bg-gray-300")} />
                      Male
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Voiceover Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSettings({ ...settings, voiceStyle: 'natural' })}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                        settings.voiceStyle === 'natural' 
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      Natural
                    </button>
                    <button
                      onClick={() => setSettings({ ...settings, voiceStyle: 'storyteller' })}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                        settings.voiceStyle === 'storyteller' 
                          ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400" 
                          : "bg-gray-50 dark:bg-[#0F1115] border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      Storyteller
                    </button>
                  </div>
                </div>
                {settings.ttsProvider === 'gemini' && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Gemini Voice Style</label>
                    <div className="relative flex items-center">
                      <select 
                        value={settings.geminiVoice}
                        onChange={(e) => setSettings({ ...settings, geminiVoice: e.target.value as GeminiVoice })}
                        className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {settings.voiceGender === 'female' ? (
                          <>
                            <option value="Zephyr">Zephyr (Soft & Natural)</option>
                            <option value="Kore">Kore (Clear & Professional)</option>
                          </>
                        ) : (
                          <>
                            <option value="Puck">Puck (Energetic)</option>
                            <option value="Charon">Charon (Deep & Calm)</option>
                            <option value="Fenrir">Fenrir (Strong)</option>
                          </>
                        )}
                      </select>
                      <div className="absolute right-4 pointer-events-none text-gray-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Default Output Language</label>
                  <div className="relative flex items-center">
                    <select 
                      value={settings.defaultOutputLang}
                      onChange={(e) => setSettings({ ...settings, defaultOutputLang: e.target.value })}
                      className="w-full p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 pointer-events-none text-gray-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      localStorage.removeItem('dz-dialect-settings');
                      window.location.reload();
                    }}
                    className="w-full p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} />
                    Reset App & Rebuild Cache
                  </button>
                  <button 
                    onClick={() => {
                      saveSettings(settings);
                      setIsSettingsOpen(false);
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
                  >
                    <Save size={20} />
                    Save Configuration
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto p-8 text-center text-gray-400 text-sm">
        <p>© 2026 DZ Dialect AI. Built for the Algerian community.</p>
      </footer>
    </div>
  );
}
