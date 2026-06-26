"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEventLike = Event & {
  results: {
    length: number;
    [index: number]: {
      length: number;
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function useVoiceInput({
  input,
  setInput,
  setComposerNote
}: {
  input: string;
  setInput: (value: string) => void;
  setComposerNote: (message: string | null) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseInputRef = useRef("");

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionConstructor =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setComposerNote("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    voiceBaseInputRef.current = input;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript || "";
      }

      if (transcript.trim()) {
        setInput(
          [voiceBaseInputRef.current.trim(), transcript.trim()]
            .filter(Boolean)
            .join(" ")
        );
      }
    };
    recognition.onerror = (event) => {
      setComposerNote(`Voice input stopped${event.error ? `: ${event.error}` : "."}`);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setComposerNote("Listening...");
    setIsListening(true);
    recognition.start();
  }, [input, isListening, setComposerNote, setInput]);

  return { isListening, toggleVoiceInput };
}
