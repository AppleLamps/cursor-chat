"use client";

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
  useEffect,
  useRef,
  useState
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Onboarding from "@/components/Onboarding";
import RepoPicker from "@/components/RepoPicker";
import SidebarRecents from "@/components/SidebarRecents";
import { consumeChatStream } from "@/lib/chat-stream";
import { createStreamBuffer } from "@/lib/stream-buffer";
import { mergeThinkingText } from "@/lib/thinking";
import { MAX_CHAT_IMAGES } from "@/lib/chat-images";
import { APP_NAME, DEFAULT_BRANCH, SUGGESTED_PROMPTS } from "@/lib/defaults";
import { RepoOption, fetchRepositories, repoLabel } from "@/lib/repo";
import { githubBlobUrl, uniqueSortedSources } from "@/lib/sources";
import {
  STORAGE_KEYS,
  clearStoredApiKey,
  clearStoredGitHubToken,
  getDefaultBranch,
  getDefaultRepo,
  getRememberKey,
  getStoredApiKey,
  getStoredGitHubToken,
  isPlausibleGitHubToken,
  maskApiKey,
  persistApiKey,
  persistGitHubToken,
  setDefaultBranch,
  setDefaultRepo
} from "@/lib/storage";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  imageAttachments?: ImageAttachment[];
  pdfAttachments?: PdfAttachment[];
  annotations?: unknown[];
  error?: boolean;
  streaming?: boolean;
  activity?: string;
  thinking?: string;
  sources?: string[];
};

type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

type PdfAttachment = {
  id: string;
  name: string;
  url: string;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  manualTitle?: boolean;
  repoUrl?: string;
  branch?: string;
  agentId?: string;
};

type RepoPickerMode = "initial" | "new-chat" | "change";

type ApiError = {
  error: string;
  status?: number;
};

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

const exampleTitle = APP_NAME;
const STORAGE_KEY = STORAGE_KEYS.CONVERSATIONS;
const SIDEBAR_STORAGE_KEY = STORAGE_KEYS.SIDEBAR;
const MAX_TEXT_ATTACHMENT_CHARS = 500_000;
const MAX_IMAGE_DATA_URL_CHARS = 850_000;
const IMAGE_MAX_DIMENSION = 1400;
const IMAGE_COMPRESSION_QUALITY = 0.82;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);
const TEXT_ATTACHMENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values"
]);

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function roleLabel(role: Role) {
  return role === "user" ? "You" : "Assistant";
}

function titleFromMessages(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const text = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "New chat";
  return text.length > 52 ? `${text.slice(0, 49)}…` : text;
}

function createConversation(repoUrl?: string, branch?: string): Conversation {
  const now = new Date().toISOString();

  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    repoUrl,
    branch: branch || DEFAULT_BRANCH
  };
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function conversationTranscript(conversationTitle: string, messages: Message[]) {
  const transcript = messages
    .map((message) => {
      const label = roleLabel(message.role);
      const attachments = [
        ...(message.imageAttachments || []).map(
          (image) => `[Attached image: ${image.name}]`
        ),
        ...(message.pdfAttachments || []).map(
          (pdf) => `[Attached PDF: ${pdf.name}]`
        )
      ];
      const attachmentText = attachments.length
        ? `\n\n${attachments.join("\n")}`
        : "";

      return `${label} (${timeLabel(message.createdAt)}):\n${message.content}${attachmentText}`;
    })
    .join("\n\n---\n\n");

  return `# ${conversationTitle}\n\n${transcript}`;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function isTextAttachment(file: File) {
  return file.type.startsWith("text/") || TEXT_ATTACHMENT_TYPES.has(file.type);
}

function isImageAttachment(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

function isPdfAttachment(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error(`Could not read ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process that image."));
    image.src = dataUrl;
  });
}

async function readImageAsDataUrl(file: File) {
  const originalUrl = await readFileAsDataUrl(file);

  if (
    originalUrl.length <= MAX_IMAGE_DATA_URL_CHARS ||
    file.type === "image/gif"
  ) {
    return { url: originalUrl, mimeType: file.type };
  }

  const image = await loadImage(originalUrl);
  const scale = Math.min(
    1,
    IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return { url: originalUrl, mimeType: file.type };

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    url: canvas.toDataURL("image/jpeg", IMAGE_COMPRESSION_QUALITY),
    mimeType: "image/jpeg"
  };
}

function isPdfUrl(url: URL) {
  return url.pathname.toLowerCase().endsWith(".pdf");
}

function fileFenceLanguage(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) return "text";

  if (["csv", "html", "json", "log", "md", "ts", "tsx", "txt", "xml"].includes(extension)) {
    return extension === "txt" ? "text" : extension;
  }

  return "text";
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Conversation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.messages)
  );
}

function stripPrivateConversationFields(conversation: Conversation) {
  const {
    systemPrompt: _systemPrompt,
    ...publicConversation
  } = conversation as Conversation & { systemPrompt?: string };

  return publicConversation;
}

export default function ChatApp() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [hasAuthHydrated, setHasAuthHydrated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(uid);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [pendingPdfs, setPendingPdfs] = useState<PdfAttachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerNote, setComposerNote] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [repoPickerMode, setRepoPickerMode] = useState<RepoPickerMode>("initial");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseInputRef = useRef("");
  const seededDefaultConversationRef = useRef(false);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  );
  const activeRepoLabel = activeConversation?.repoUrl
    ? `${repoLabel(activeConversation.repoUrl)} · ${activeConversation.branch || DEFAULT_BRANCH}`
    : "Select repository";

  const canSend =
    (input.trim().length > 0 || pendingImages.length > 0) &&
    !isSending &&
    !isReadingFiles;
  const lastAssistantErrored = messages[messages.length - 1]?.error === true;

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setGithubToken(getStoredGitHubToken());
    setHasAuthHydrated(true);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const storedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      const saved = Array.isArray(parsed)
        ? sortConversations(
            parsed.filter(isConversation).map(stripPrivateConversationFields)
          )
        : [];

      if (storedSidebar) {
        setSidebarOpen(storedSidebar !== "collapsed");
      }

      if (saved.length > 0) {
        const latest = saved[0];
        setConversations(saved);
        setActiveConversationId(latest.id);
        setMessages(latest.messages);
        setLastUserMessage(
          [...latest.messages].reverse().find((message) => message.role === "user")
            ?.content || null
        );
      }
    } catch {
      // Corrupt local storage should never block the chat UI.
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      sidebarOpen ? "expanded" : "collapsed"
    );
  }, [sidebarOpen, hasHydrated]);

  useEffect(() => {
    if (!apiKey || !hasAuthHydrated) return;
    void loadRepositories(apiKey);
  }, [apiKey, hasAuthHydrated]);

  useEffect(() => {
    if (!hasHydrated || !apiKey || seededDefaultConversationRef.current) return;

    if (conversations.length > 0) {
      seededDefaultConversationRef.current = true;
      return;
    }

    const defaultRepo = getDefaultRepo();
    if (!defaultRepo) return;

    seededDefaultConversationRef.current = true;
    const conversation = createConversation(
      defaultRepo,
      getDefaultBranch() || DEFAULT_BRANCH
    );
    setConversations([conversation]);
    setActiveConversationId(conversation.id);
    setMessages([]);
  }, [hasHydrated, apiKey, conversations.length]);

  async function loadRepositories(key: string) {
    setReposLoading(true);
    setReposError(null);

    try {
      setRepos(await fetchRepositories(key));
    } catch (caught) {
      setRepos([]);
      setReposError(
        caught instanceof Error ? caught.message : "Failed to load repositories."
      );
    } finally {
      setReposLoading(false);
    }
  }

  function updateConversationRepo(id: string, repoUrl: string, branch: string) {
    setConversations((current) =>
      sortConversations(
        current.map((conversation) =>
          conversation.id === id
            ? {
                ...conversation,
                repoUrl,
                branch,
                agentId: undefined,
                updatedAt: new Date().toISOString()
              }
            : conversation
        )
      )
    );
  }

  function activateConversation(conversation: Conversation) {
    setConversations((current) =>
      sortConversations([
        conversation,
        ...current.filter((item) => item.id !== conversation.id)
      ])
    );
    setActiveConversationId(conversation.id);
    setMessages([]);
    setInput("");
    setPendingImages([]);
    setPendingPdfs([]);
    setError(null);
    setLastUserMessage(null);
    inputRef.current?.focus();
  }

  function handleRepoSelect(
    repoUrl: string,
    branch: string,
    rememberAsDefault: boolean
  ) {
    if (rememberAsDefault) {
      setDefaultRepo(repoUrl);
      setDefaultBranch(branch);
    }

    if (repoPickerMode === "change" && activeConversation) {
      updateConversationRepo(activeConversation.id, repoUrl, branch);
      setRepoPickerOpen(false);
      setError(null);
      return;
    }

    activateConversation(createConversation(repoUrl, branch));
    setRepoPickerOpen(false);
    setRepoPickerMode("initial");
    setError(null);
  }

  function openRepoPicker(mode: RepoPickerMode) {
    setRepoPickerMode(mode);
    setRepoPickerOpen(true);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function persistActiveConversation(
    nextMessages: Message[],
    nextAgentId?: string
  ) {
    if (nextMessages.length === 0) return;

    const now = new Date().toISOString();
    setConversations((current) => {
      const existing = current.find(
        (conversation) => conversation.id === activeConversationId
      );
      const title =
        existing?.manualTitle && existing.title
          ? existing.title
          : titleFromMessages(nextMessages);
      const nextConversation: Conversation = {
        id: activeConversationId,
        title,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        messages: nextMessages,
        manualTitle: existing?.manualTitle,
        repoUrl: existing?.repoUrl,
        branch: existing?.branch,
        agentId: nextAgentId ?? existing?.agentId
      };

      return sortConversations([
        nextConversation,
        ...current.filter(
          (conversation) => conversation.id !== activeConversationId
        )
      ]);
    });
  }

  function openConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput("");
    setPendingImages([]);
    setPendingPdfs([]);
    setError(null);
    setLastUserMessage(
      [...conversation.messages].reverse().find((message) => message.role === "user")
        ?.content || null
    );
  }

  function startNewChatSameRepo() {
    const repoUrl = activeConversation?.repoUrl || getDefaultRepo();
    const branch =
      activeConversation?.branch || getDefaultBranch() || DEFAULT_BRANCH;

    if (!repoUrl) {
      openRepoPicker("new-chat");
      return;
    }

    activateConversation(createConversation(repoUrl, branch));
  }

  function startNewChatInAnotherRepo() {
    openRepoPicker("new-chat");
  }

  function deleteConversation(id: string) {
    const remaining = sortConversations(
      conversations.filter((conversation) => conversation.id !== id)
    );
    setConversations(remaining);

    if (id !== activeConversationId) return;

    const next = remaining[0];
    if (next) {
      openConversation(next);
      return;
    }

    startNewChatSameRepo();
  }

  function renameConversation(id: string) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;

    const nextTitle = window.prompt("Rename chat", conversation.title)?.trim();
    if (!nextTitle) return;

    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                title: nextTitle,
                manualTitle: true,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      )
    );
  }

  async function sendMessage(
    content: string,
    retry = false,
    baseMessages = messages
  ) {
    const trimmed = content.trim();
    const imagesForMessage = retry ? [] : pendingImages;
    const pdfsForMessage = retry ? [] : pendingPdfs;
    const messageContent =
      trimmed ||
      (pdfsForMessage.length > 0
        ? "What are the main points in this document?"
        : "What's in this image?");

    if (
      (!trimmed && imagesForMessage.length === 0 && pdfsForMessage.length === 0) ||
      isSending
    ) {
      return;
    }

    if (!activeConversation?.repoUrl) {
      setError("Select a repository before sending a message.");
      openRepoPicker(activeConversation ? "change" : "initial");
      return;
    }

    if (!apiKey) {
      setError("Connect a Cursor API key before sending a message.");
      return;
    }

    if (pdfsForMessage.length > 0) {
      setError("PDF attachments are not supported. Use images or text.");
      return;
    }

    if (imagesForMessage.length > MAX_CHAT_IMAGES) {
      setError(`You can attach up to ${MAX_CHAT_IMAGES} images per message.`);
      return;
    }

    setError(null);
    setComposerNote(null);
    setIsSending(true);
    setLastUserMessage(messageContent);

    const userMessage: Message = {
      id: uid(),
      role: "user",
      content: messageContent,
      createdAt: new Date().toISOString(),
      imageAttachments:
        imagesForMessage.length > 0 ? imagesForMessage : undefined,
      pdfAttachments: pdfsForMessage.length > 0 ? pdfsForMessage : undefined
    };

    const cleanMessages = baseMessages.filter((message) => !message.error);
    const optimisticMessages = retry ? cleanMessages : [...cleanMessages, userMessage];

    setMessages(optimisticMessages);
    persistActiveConversation(optimisticMessages);

    if (!retry) {
      setInput("");
      setPendingImages([]);
      setPendingPdfs([]);
    }

    const assistantId = uid();
    let assistantContent = "";
    let assistantThinking = "";
    let assistantActivity = "Starting Cursor cloud agent…";
    let assistantSources: string[] = [];
    let resolvedAgentId = activeConversation.agentId;
    const streamingAssistant: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      activity: assistantActivity
    };

    setMessages([...optimisticMessages, streamingAssistant]);

    const streamBuffer = createStreamBuffer(50, (snapshot) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: snapshot.content,
                thinking: snapshot.thinking || undefined,
                activity: snapshot.activity || undefined
              }
            : message
        )
      );
    });
    streamBuffer.setActivity(assistantActivity);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          prompt: messageContent,
          repoUrl: activeConversation.repoUrl,
          branch: activeConversation.branch || DEFAULT_BRANCH,
          agentId: activeConversation.agentId,
          images: imagesForMessage.map((image) => ({
            url: image.url,
            mimeType: image.mimeType
          }))
        })
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.error || "The request failed. Please try again.");
      }

      if (!contentType.includes("text/event-stream")) {
        throw new Error("Expected a streaming response from the server.");
      }

      await consumeChatStream(response, {
        onAgent: (agentIdFromStream) => {
          resolvedAgentId = agentIdFromStream;
        },
        onText: (delta) => {
          assistantContent += delta;
          streamBuffer.appendText(delta);
        },
        onThinking: (payload) => {
          assistantThinking = mergeThinkingText(assistantThinking, payload);
          streamBuffer.setThinking(assistantThinking);
        },
        onActivity: (activity) => {
          assistantActivity = activity;
          streamBuffer.setActivity(activity);
        },
        onSource: (path) => {
          assistantSources = uniqueSortedSources([...assistantSources, path]);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, sources: assistantSources }
                : message
            )
          );
        },
        onDone: (payload) => {
          resolvedAgentId = payload.agentId;
          if (payload.result?.trim()) {
            assistantContent = payload.result.trim();
            streamBuffer.setContent(assistantContent);
          }
          if (payload.thinking?.trim()) {
            assistantThinking = mergeThinkingText(assistantThinking, {
              text: payload.thinking.trim()
            });
            streamBuffer.setThinking(assistantThinking);
          }
        }
      });

      streamBuffer.flushNow();

      if (!assistantContent.trim()) {
        throw new Error("Cursor returned no assistant content.");
      }

      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: assistantContent,
        createdAt: streamingAssistant.createdAt,
        streaming: false,
        thinking: assistantThinking || undefined,
        sources: assistantSources
      };
      const finalMessages = [...optimisticMessages, assistantMessage];
      setMessages(finalMessages);
      persistActiveConversation(finalMessages, resolvedAgentId);
      setComposerNote("Answer generated by Cursor cloud agent.");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Something went wrong.";
      const errorMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: message,
        createdAt: streamingAssistant.createdAt,
        error: true,
        streaming: false
      };
      const finalMessages = [...optimisticMessages, errorMessage];
      setError(message);
      setMessages(finalMessages);
      persistActiveConversation(finalMessages);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void sendMessage(input);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function retryLast() {
    if (!lastUserMessage) return;
    void sendMessage(lastUserMessage, true);
  }

  async function copyMessage(message: Message) {
    try {
      await copyText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch {
      setError("Could not copy that message.");
    }
  }

  function retryAssistantMessage(messageId: string) {
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex <= 0) return;

    const previousMessages = messages.slice(0, messageIndex);
    const previousUserMessage = [...previousMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (!previousUserMessage) {
      setError("No user message found to retry.");
      return;
    }

    const nextMessages = previousMessages.filter((message) => !message.error);
    setMessages(nextMessages);
    persistActiveConversation(nextMessages);
    void sendMessage(previousUserMessage.content, true, nextMessages);
  }

  async function shareConversation() {
    if (messages.length === 0) {
      setComposerNote("Start a chat before sharing.");
      return;
    }

    const activeConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId
    );
    const title = activeConversation?.title || titleFromMessages(messages);
    const text = conversationTranscript(title, messages);

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setShareStatus("Shared");
      } else {
        await copyText(text);
        setShareStatus("Copied");
        setComposerNote("Conversation transcript copied to clipboard.");
      }

      window.setTimeout(() => setShareStatus(null), 1500);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Could not share this conversation.");
    }
  }

  async function addAttachments(files: FileList | null) {
    if (!files?.length) return;

    setIsReadingFiles(true);
    setError(null);

    try {
      const textBlocks: string[] = [];
      const imageBlocks: ImageAttachment[] = [];

      for (const file of Array.from(files)) {
        if (isImageAttachment(file)) {
          const image = await readImageAsDataUrl(file);

          imageBlocks.push({
            id: uid(),
            name: file.name,
            mimeType: image.mimeType,
            url: image.url
          });
          continue;
        }

        if (isPdfAttachment(file)) {
          throw new Error("PDF attachments are not supported. Use images or text.");
        }

        if (isTextAttachment(file)) {
          const text = await file.text();
          const clipped =
            text.length > MAX_TEXT_ATTACHMENT_CHARS
              ? `${text.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n\n[Truncated after ${MAX_TEXT_ATTACHMENT_CHARS.toLocaleString()} characters.]`
              : text;

          textBlocks.push(
            `Attached file: ${file.name}\n\n\`\`\`${fileFenceLanguage(file.name)}\n${clipped}\n\`\`\``
          );
          continue;
        }

        throw new Error(
          `${file.name} is not supported. Attach text files, PDFs, or PNG, JPEG, WebP, and GIF images.`
        );
      }

      if (textBlocks.length > 0) {
        setInput((current) =>
          [current.trim(), ...textBlocks].filter(Boolean).join("\n\n")
        );
      }

      if (imageBlocks.length > 0) {
        setPendingImages((current) => {
          const combined = [...current, ...imageBlocks];
          if (combined.length > MAX_CHAT_IMAGES) {
            throw new Error(
              `You can attach up to ${MAX_CHAT_IMAGES} images per message.`
            );
          }
          return combined;
        });
      }

      const notes = [
        textBlocks.length > 0
          ? `${textBlocks.length.toLocaleString()} text attachment${textBlocks.length === 1 ? "" : "s"} added`
          : "",
        imageBlocks.length > 0
          ? `${imageBlocks.length.toLocaleString()} image${imageBlocks.length === 1 ? "" : "s"} added`
          : ""
      ].filter(Boolean);

      if (notes.length > 0) {
        setComposerNote(`${notes.join(" and ")} to the prompt.`);
      }

      inputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file.");
    } finally {
      setIsReadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePendingImage(id: string) {
    setPendingImages((current) => {
      const next = current.filter((image) => image.id !== id);

      if (next.length === 0 && pendingPdfs.length === 0) {
        setComposerNote(null);
      }

      return next;
    });
  }

  function removePendingPdf(id: string) {
    setPendingPdfs((current) => {
      const next = current.filter((pdf) => pdf.id !== id);

      if (next.length === 0 && pendingImages.length === 0) {
        setComposerNote(null);
      }

      return next;
    });
  }

  function addHostedImageUrl() {
    const url = window.prompt("Paste a public image URL")?.trim();

    if (!url) return;

    try {
      const parsed = new URL(url);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Use a public http or https image URL.");
      }

      if (isPdfUrl(parsed)) {
        throw new Error("PDF URLs are not supported. Use an image URL.");
      }

      setPendingImages((current) => {
        if (current.length >= MAX_CHAT_IMAGES) {
          throw new Error(
            `You can attach up to ${MAX_CHAT_IMAGES} images per message.`
          );
        }

        return [
          ...current,
          {
            id: uid(),
            name: parsed.pathname.split("/").pop() || "Hosted image",
            mimeType: "image/url",
            url
          }
        ];
      });
      setComposerNote("Hosted image URL added to the next message.");
      inputRef.current?.focus();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That image URL is not valid."
      );
    }
  }

  function toggleVoiceInput() {
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
  }

  function resetChat() {
    startNewChatSameRepo();
  }

  function openMobileConversation(conversation: Conversation) {
    openConversation(conversation);
    setMobileSidebarOpen(false);
  }

  function startMobileNewChatSameRepo() {
    startNewChatSameRepo();
    setMobileSidebarOpen(false);
  }

  function startMobileNewChatInAnotherRepo() {
    startNewChatInAnotherRepo();
    setMobileSidebarOpen(false);
  }

  function handleOnboardingComplete({
    apiKey: key,
    githubToken: token,
    remember
  }: {
    apiKey: string;
    githubToken?: string;
    remember: boolean;
  }) {
    persistApiKey(key, remember);
    persistGitHubToken(token ?? null, remember);
    setApiKey(key);
    setGithubToken(token ?? null);
  }

  function handleSignOut() {
    clearStoredApiKey();
    setApiKey(null);
    setGithubToken(null);
    setRepos([]);
    setReposError(null);
    setRepoPickerOpen(false);
    setRepoPickerMode("initial");
    seededDefaultConversationRef.current = false;
    setMobileSidebarOpen(false);
  }

  function handleClearGitHubToken() {
    clearStoredGitHubToken();
    setGithubToken(null);
  }

  function handleSaveGitHubToken(token: string) {
    const trimmed = token.trim();

    if (!isPlausibleGitHubToken(trimmed)) {
      return false;
    }

    persistGitHubToken(trimmed, getRememberKey());
    setGithubToken(trimmed);
    return true;
  }

  const needsInitialRepoPicker = Boolean(
    apiKey && hasHydrated && !activeConversation?.repoUrl && !repoPickerOpen
  );

  if (!hasAuthHydrated || !hasHydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-white text-sm text-[#8a8a8a]">
        Loading…
      </main>
    );
  }

  if (!apiKey) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (needsInitialRepoPicker) {
    return (
      <RepoPicker
        mode="page"
        repos={repos}
        loading={reposLoading}
        error={reposError}
        githubToken={githubToken}
        initialBranch={getDefaultBranch() || DEFAULT_BRANCH}
        onRetry={() => void loadRepositories(apiKey)}
        onSelect={handleRepoSelect}
      />
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-white text-[#0d0d0d]">
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/25"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] max-w-[86vw] flex-col border-r border-[#e8e8e8] bg-[#f9f9f9] shadow-[12px_0_40px_rgba(0,0,0,0.12)]">
            <SidebarPanel
              conversations={conversations}
              activeConversationId={activeConversationId}
              apiKey={apiKey}
              githubToken={githubToken}
              onNewChat={startMobileNewChatSameRepo}
              onNewChatInAnotherRepo={startMobileNewChatInAnotherRepo}
              onOpenConversation={openMobileConversation}
              onRenameConversation={renameConversation}
              onDeleteConversation={deleteConversation}
              onSignOut={handleSignOut}
              onClearGitHubToken={handleClearGitHubToken}
              onSaveGitHubToken={handleSaveGitHubToken}
              defaultRepoLabel={
                getDefaultRepo() ? repoLabel(getDefaultRepo()!) : null
              }
              onCollapse={() => setMobileSidebarOpen(false)}
              collapseLabel="Close sidebar"
            />
          </aside>
        </div>
      ) : null}

      {sidebarOpen ? (
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-[#e8e8e8] bg-[#f9f9f9] md:flex">
          <SidebarPanel
            conversations={conversations}
            activeConversationId={activeConversationId}
            apiKey={apiKey}
            githubToken={githubToken}
            onNewChat={resetChat}
            onNewChatInAnotherRepo={startNewChatInAnotherRepo}
            onOpenConversation={openConversation}
            onRenameConversation={renameConversation}
            onDeleteConversation={deleteConversation}
            onSignOut={handleSignOut}
            onClearGitHubToken={handleClearGitHubToken}
            onSaveGitHubToken={handleSaveGitHubToken}
            defaultRepoLabel={
              getDefaultRepo() ? repoLabel(getDefaultRepo()!) : null
            }
            onCollapse={() => setSidebarOpen(false)}
            collapseLabel="Collapse sidebar"
          />
        </aside>
      ) : null}

      <section className="relative flex min-w-0 flex-1 flex-col bg-white">
          {repoPickerOpen ? (
            <RepoPicker
              mode="modal"
              repos={repos}
              loading={reposLoading}
              error={reposError}
              githubToken={githubToken}
              initialRepoUrl={activeConversation?.repoUrl || getDefaultRepo()}
              initialBranch={
                activeConversation?.branch || getDefaultBranch() || DEFAULT_BRANCH
              }
              title={
                repoPickerMode === "new-chat"
                  ? "Start a chat in another repository"
                  : "Change repository"
              }
              description={
                repoPickerMode === "new-chat"
                  ? "Choose which codebase the new conversation should use."
                  : "Update which codebase this conversation should answer questions about."
              }
              submitLabel={repoPickerMode === "new-chat" ? "Start chat" : "Save"}
              onRetry={() => void loadRepositories(apiKey)}
              onSelect={handleRepoSelect}
              onCancel={() => setRepoPickerOpen(false)}
            />
          ) : null}

          <Header
            onReset={resetChat}
            onShare={shareConversation}
            canShare={messages.length > 0}
            shareStatus={shareStatus}
            sidebarOpen={sidebarOpen}
            repoLabel={activeRepoLabel}
            onChangeRepo={() =>
              openRepoPicker(activeConversation?.repoUrl ? "change" : "initial")
            }
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />

          <div
            ref={scrollRef}
          className="scrollbar-soft flex-1 overflow-y-auto px-4 pb-44 pt-8 sm:px-6"
          >
            {messages.length === 0 ? (
              <EmptyState
                onPick={(prompt) => {
                  setInput(prompt);
                  inputRef.current?.focus();
                }}
              />
            ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-7">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    repoUrl={activeConversation?.repoUrl}
                    branch={activeConversation?.branch || DEFAULT_BRANCH}
                    copied={copiedMessageId === message.id}
                    onCopy={() => void copyMessage(message)}
                    onRetry={() => retryAssistantMessage(message.id)}
                  />
                ))}
              </div>
            )}
          </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-12 sm:px-6">
          <div className="pointer-events-auto">
            {error && (
              <ErrorBanner
                message={error}
                canRetry={Boolean(lastUserMessage) || lastAssistantErrored}
                onRetry={retryLast}
              />
            )}
            <Composer
              value={input}
              images={pendingImages}
              pdfs={pendingPdfs}
              onChange={setInput}
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
              canSend={canSend}
              isSending={isSending}
              isReadingFiles={isReadingFiles}
              isListening={isListening}
              note={composerNote}
              onAttachClick={() => fileInputRef.current?.click()}
              onHostedImageClick={addHostedImageUrl}
              onRemoveImage={removePendingImage}
              onRemovePdf={removePendingPdf}
              onToggleVoice={toggleVoiceInput}
              inputRef={inputRef}
            />
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Attach images"
              title="Attach images"
              className="hidden"
              multiple
              accept="image/gif,image/jpeg,image/png,image/webp"
              onChange={(event) => void addAttachments(event.target.files)}
            />
          </div>
        </div>
      </section>

    </main>
  );
}

function SidebarPanel({
  conversations,
  activeConversationId,
  apiKey,
  githubToken,
  onNewChat,
  onNewChatInAnotherRepo,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  onSignOut,
  onClearGitHubToken,
  onSaveGitHubToken,
  defaultRepoLabel,
  onCollapse,
  collapseLabel
}: {
  conversations: Conversation[];
  activeConversationId: string;
  apiKey: string;
  githubToken?: string | null;
  onNewChat: () => void;
  onNewChatInAnotherRepo: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSignOut: () => void;
  onClearGitHubToken: () => void;
  onSaveGitHubToken: (token: string) => boolean;
  defaultRepoLabel?: string | null;
  onCollapse: () => void;
  collapseLabel: string;
}) {
  const [showGitHubForm, setShowGitHubForm] = useState(false);
  const [githubInput, setGithubInput] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);

  function handleSaveGitHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGithubError(null);

    if (!onSaveGitHubToken(githubInput)) {
      setGithubError("Enter a valid GitHub token.");
      return;
    }

    setGithubInput("");
    setShowGitHubForm(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center justify-between gap-2">
        <BrandBlock />
        <button
          onClick={onCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#555] transition hover:bg-[#ececec] hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
          aria-label={collapseLabel}
          title={collapseLabel}
        >
          ◧
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <SidebarButton label="New chat" icon={<IconEdit />} onClick={onNewChat} />
        <SidebarButton
          label="New chat in…"
          icon={<IconSwitch />}
          onClick={onNewChatInAnotherRepo}
        />
      </div>

      <div className="mt-6 px-2 text-xs font-semibold text-[#6b6b6b]">
        Projects
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        <SidebarRecents
          conversations={conversations}
          activeConversationId={activeConversationId}
          onOpenConversation={(item) => {
            const conversation = conversations.find(
              (entry) => entry.id === item.id
            );

            if (conversation) {
              onOpenConversation(conversation);
            }
          }}
          onRenameConversation={onRenameConversation}
          onDeleteConversation={onDeleteConversation}
        />
      </div>

      <div className="mt-auto border-t border-[#ececec] pt-3">
        <div className="rounded-xl border border-[#ececec] bg-[#fafafa] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
            Settings
          </p>

          {defaultRepoLabel ? (
            <div className="mt-3">
              <div className="flex items-start gap-2.5">
                <SidebarIcon>
                  <IconFolder />
                </SidebarIcon>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#8a8a8a]">Default repository</p>
                  <p
                    className="mt-0.5 truncate text-sm text-[#303030]"
                    title={defaultRepoLabel}
                  >
                    {defaultRepoLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={
              defaultRepoLabel ? "mt-3 border-t border-[#ececec] pt-3" : "mt-3"
            }
          >
            <div className="flex items-start gap-2.5">
              <SidebarIcon>
                <IconGitHub />
              </SidebarIcon>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8a8a8a]">GitHub token</p>
                {githubToken ? (
                  <p
                    className="mt-0.5 truncate font-mono text-sm text-[#303030]"
                    title="Connected GitHub token"
                  >
                    {maskApiKey(githubToken)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-[#303030]">Not connected</p>
                )}
              </div>
            </div>

            {githubToken ? (
              <SettingsAction
                label="Clear GitHub token"
                icon={<IconKeyOff />}
                onClick={onClearGitHubToken}
              />
            ) : showGitHubForm ? (
              <form onSubmit={handleSaveGitHub} className="mt-2 space-y-2">
                <input
                  type="password"
                  value={githubInput}
                  onChange={(event) => setGithubInput(event.target.value)}
                  placeholder="ghp_… or github_pat_…"
                  className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec]"
                />
                {githubError ? (
                  <p className="text-xs text-red-700">{githubError}</p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGitHubForm(false);
                      setGithubInput("");
                      setGithubError(null);
                    }}
                    className="rounded-full border border-[#d9d9d9] px-3 py-1.5 text-xs font-medium text-[#444] transition hover:bg-[#f7f7f8]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-[#0d0d0d] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#303030]"
                  >
                    Save token
                  </button>
                </div>
              </form>
            ) : (
              <SettingsAction
                label="Add GitHub token"
                icon={<IconGitHub className="h-4 w-4" />}
                onClick={() => setShowGitHubForm(true)}
              />
            )}
          </div>

          <div className="mt-3 border-t border-[#ececec] pt-3">
            <div className="flex items-start gap-2.5">
              <SidebarIcon>
                <IconKey />
              </SidebarIcon>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8a8a8a]">Cursor API key</p>
                <p
                  className="mt-0.5 truncate font-mono text-sm text-[#303030]"
                  title="Connected API key"
                >
                  {maskApiKey(apiKey)}
                </p>
              </div>
            </div>
            <SettingsAction
              label="Clear saved key"
              icon={<IconKeyOff />}
              onClick={onSignOut}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">
            {exampleTitle}
          </h1>
        </div>
      </div>
    </div>
  );
}

function SidebarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#555] [&>svg]:h-4 [&>svg]:w-4">
      {children}
    </span>
  );
}

function SettingsAction({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[#444] transition hover:bg-[#ececec] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#777]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function SidebarButton({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-10 items-center gap-2.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2.5 text-left text-sm font-medium leading-none text-[#303030] shadow-sm transition hover:border-[#d4d4d4] hover:bg-[#f8f8f8] active:border-[#cccccc] active:bg-[#f0f0f0] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
    >
      <SidebarIcon>{icon}</SidebarIcon>
      <span className="truncate">{label}</span>
    </button>
  );
}

function IconEdit({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconFolder({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconGitHub({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.336 2.865 7.996 6.839 9.288.5.092.682-.218.682-.483 0-.237-.009-.866-.013-1.699-2.782.621-3.369-1.349-3.369-1.349-.454-1.178-1.11-1.491-1.11-1.491-.908-.637.069-.624.069-.624 1.004.071 1.532 1.051 1.532 1.051.892 1.561 2.341 1.111 2.91.85.092-.662.35-1.111.636-1.367-2.221-.259-4.555-1.14-4.555-5.071 0-1.119.39-2.034 1.029-2.751-.103-.259-.446-1.308.098-2.727 0 0 .84-.273 2.75 1.037A9.3 9.3 0 0 1 12 6.836c.85.004 1.705.116 2.504.337 1.909-1.31 2.747-1.037 2.747-1.037.546 1.42.203 2.468.1 2.727.64.717 1.028 1.632 1.028 2.751 0 3.943-2.337 4.809-4.564 5.063.359.317.678.941.678 1.896 0 1.368-.012 2.47-.012 2.807 0 .268.18.58.688.481A10.02 10.02 0 0 0 22 12.253C22 6.586 17.523 2 12 2Z" />
    </svg>
  );
}

function IconKey({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="m10.5 12.5 7-7" />
      <path d="m18 5 1 1" />
      <path d="m15 8 1 1" />
    </svg>
  );
}

function IconKeyOff({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2 2 20 20" />
      <path d="M6.5 6.5A4 4 0 0 0 5 10v4a2 2 0 0 0 2 2h2" />
      <path d="M10.5 10.5 18 18" />
      <path d="M18 10v4a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function IconSwitch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M21 3 14 10" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function Header({
  onReset,
  onShare,
  canShare,
  shareStatus,
  sidebarOpen,
  repoLabel,
  onChangeRepo,
  onToggleSidebar,
  onOpenMobileSidebar
}: {
  onReset: () => void;
  onShare: () => void;
  canShare: boolean;
  shareStatus: string | null;
  sidebarOpen: boolean;
  repoLabel: string;
  onChangeRepo: () => void;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-white px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMobileSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          ◧
        </button>
        {!sidebarOpen ? (
          <button
            onClick={onToggleSidebar}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:flex"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            ◧
          </button>
        ) : null}
        <button
          onClick={onReset}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
        >
          New chat
        </button>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <p className="truncate text-sm font-semibold text-[#333]">
            {exampleTitle}
          </p>
          <span className="text-[#c7c7c7]">•</span>
          <button
            type="button"
            onClick={onChangeRepo}
            className="truncate font-mono text-xs text-[#777] transition hover:text-[#333] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
            title="Change repository"
          >
            {repoLabel}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onChangeRepo}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
        >
          Repo
        </button>
        <button
          onClick={onReset}
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] sm:inline-flex"
        >
          New chat
        </button>
        <button
          onClick={onShare}
          disabled={!canShare}
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] disabled:cursor-not-allowed disabled:text-[#b6b6b6] disabled:hover:bg-transparent sm:inline-flex"
          title={shareStatus || "Share conversation"}
        >
          {shareStatus || "Share"}
        </button>
      </div>
    </header>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
      <div className="w-full py-10 text-center sm:py-16">
        <h2 className="text-2xl font-medium tracking-tight text-[#202123] sm:text-[28px]">
          Ask Cursor anything about your repo
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#5f6368]">
          Questions are answered from the repository selected in the header,
          with sources you can verify.
        </p>
        <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2 sm:items-start">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPick(prompt)}
              className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left text-sm leading-6 text-[#5f6368] transition hover:bg-[#f7f7f8] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  repoUrl,
  branch,
  copied,
  onCopy,
  onRetry
}: {
  message: Message;
  repoUrl?: string;
  branch?: string;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
}) {
  const isUser = message.role === "user";
  const imageAttachments = message.imageAttachments || [];
  const pdfAttachments = message.pdfAttachments || [];
  const hasImageAttachments = imageAttachments.length > 0;
  const hasPdfAttachments = pdfAttachments.length > 0;
  const isStreaming = message.streaming === true;
  const showStreamingPlaceholder =
    isStreaming && !message.content.trim() && !message.thinking?.trim();
  const showActivity =
    isStreaming && message.activity && message.activity !== "Thinking…";

  return (
    <article
      className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`${isUser ? "max-w-[78%]" : "w-full max-w-3xl"}`}>
        {isUser && (hasImageAttachments || hasPdfAttachments) ? (
          <div className="mb-2 flex flex-col items-end gap-2">
            {hasImageAttachments ? (
              <div className="grid max-w-[340px] grid-cols-1 gap-2">
                {imageAttachments.map((image) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={image.name}
                    className="max-h-64 w-full rounded-[1.35rem] object-cover"
                  />
                ))}
              </div>
            ) : null}
            {hasPdfAttachments ? (
              <div className="flex max-w-[340px] flex-col gap-2">
                {pdfAttachments.map((pdf) => (
                  <a
                    key={pdf.id}
                    href={pdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 text-left text-sm text-[#111] shadow-sm transition hover:bg-[#f7f7f8]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ff4f45] text-xs font-bold text-white">
                      PDF
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {pdf.name}
                      </span>
                      <span className="text-xs text-[#777]">PDF</span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={isUser ? "flex justify-end" : "flex justify-start"}>
          <div
            className={
              isUser
                ? "rounded-[1.35rem] bg-[#0d0d0d] px-4 py-3 text-white"
                : message.error
                  ? "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950"
                  : "px-1 py-1 text-[#111]"
            }
          >
            {!isUser && message.thinking?.trim() ? (
              <ThinkingPanel content={message.thinking} streaming={isStreaming} />
            ) : null}
            <MarkdownMessage content={message.content} isUser={isUser} />
            {showStreamingPlaceholder ? (
              <div className="mt-2 space-y-2">
                <div className="h-3 w-64 max-w-full animate-pulse rounded-full bg-[#ececec]" />
                <div className="h-3 w-48 max-w-full animate-pulse rounded-full bg-[#ececec]" />
              </div>
            ) : null}
            {showActivity ? (
              <p className="mt-3 text-sm text-[#8a8a8a]">{message.activity}</p>
            ) : null}
            {!isUser && !message.error && message.sources?.length ? (
              <SourcesPanel
                sources={message.sources}
                repoUrl={repoUrl}
                branch={branch || DEFAULT_BRANCH}
              />
            ) : null}
            {!isUser && hasPdfAttachments ? (
              <div className="mt-3 flex flex-col gap-2">
                {pdfAttachments.map((pdf) => (
                  <a
                    key={pdf.id}
                    href={pdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-xs items-center gap-2 rounded-md bg-[#f2f2f2] px-2 py-1 text-xs text-[#555] underline-offset-4 hover:underline"
                  >
                    <span>▯</span>
                    <span className="truncate">{pdf.name}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={`mt-2 flex items-center gap-3 px-1 text-xs text-[#8a8a8a] ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span>{roleLabel(message.role)}</span>
          <span>•</span>
          <time>{timeLabel(message.createdAt)}</time>
          {!isUser && !message.error && !isStreaming ? (
            <span className="hidden items-center gap-2 opacity-0 transition group-hover:inline-flex group-hover:opacity-100 sm:inline-flex">
              <button
                type="button"
                onClick={onCopy}
                className="rounded px-1 py-0.5 hover:bg-[#f2f2f2] hover:text-[#444] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={onRetry}
                className="rounded px-1 py-0.5 hover:bg-[#f2f2f2] hover:text-[#444] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              >
                Retry
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ThinkingPanel({
  content,
  streaming
}: {
  content: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(streaming));
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [streaming]);

  useEffect(() => {
    if (!streaming || !open || !previewRef.current) return;
    previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [content, streaming, open]);

  return (
    <div className="mb-3 rounded-xl border border-[#ececec] bg-[#fafafa]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[#555] transition hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
        aria-expanded={open}
      >
        <span className="font-medium">{streaming ? "Thinking…" : "Thinking"}</span>
        <IconChevron open={open} />
      </button>
      {open ? (
        <div
          ref={previewRef}
          className="max-h-40 overflow-y-auto border-t border-[#ececec] px-3 py-2.5"
        >
          <p className="whitespace-pre-wrap text-xs leading-5 text-[#666]">{content}</p>
        </div>
      ) : null}
    </div>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-[#777] transition ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SourcesPanel({
  sources,
  repoUrl,
  branch
}: {
  sources: string[];
  repoUrl?: string;
  branch: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-[#ececec] pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-left text-sm text-[#555] transition hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
        aria-expanded={open}
      >
        <span className="font-medium">Sources ({sources.length})</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {sources.map((path) => {
            const href = repoUrl ? githubBlobUrl(repoUrl, branch, path) : null;

            return (
              <li key={path} className="font-mono text-xs text-[#666]">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline-offset-4 hover:underline"
                  >
                    {path}
                  </a>
                ) : (
                  <span className="break-all">{path}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function MarkdownMessage({
  content,
  isUser
}: {
  content: string;
  isUser: boolean;
}) {
  return (
    <div
      className={`message-content text-[15px] leading-7 ${
        isUser ? "message-content-user" : "message-content-assistant"
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ErrorBanner({
  message,
  canRetry,
  onRetry
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mb-3 flex max-w-4xl flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {canRetry ? (
        <button
          onClick={onRetry}
          className="rounded-full bg-red-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function Composer({
  value,
  images,
  pdfs,
  onChange,
  onSubmit,
  onKeyDown,
  canSend,
  isSending,
  isReadingFiles,
  isListening,
  note,
  onAttachClick,
  onHostedImageClick,
  onRemoveImage,
  onRemovePdf,
  onToggleVoice,
  inputRef
}: {
  value: string;
  images: ImageAttachment[];
  pdfs: PdfAttachment[];
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  canSend: boolean;
  isSending: boolean;
  isReadingFiles: boolean;
  isListening: boolean;
  note: string | null;
  onAttachClick: () => void;
  onHostedImageClick: () => void;
  onRemoveImage: (id: string) => void;
  onRemovePdf: (id: string) => void;
  onToggleVoice: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <div className="rounded-[1.75rem] border border-[#d9d9d9] bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition focus-within:border-[#bdbdbd]">
        {images.length > 0 || pdfs.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto px-2 pb-2 pt-1">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-[#d9d9d9] bg-[#f7f7f8]"
                title={image.name}
              >
                <img
                  src={image.url}
                  alt={image.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-sm text-white transition hover:bg-black"
                  aria-label={`Remove ${image.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {pdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="relative flex h-16 w-72 max-w-[80vw] shrink-0 items-center gap-3 rounded-xl border border-[#d9d9d9] bg-[#f7f7f8] px-3 pr-9 text-sm text-[#222]"
                title={pdf.name}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ff4f45] text-xs font-bold text-white">
                  PDF
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{pdf.name}</span>
                  <span className="text-xs text-[#777]">PDF</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePdf(pdf.id)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-sm text-white transition hover:bg-black"
                  aria-label={`Remove ${pdf.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about this repository. Enter sends, Shift+Enter adds a line."
          rows={1}
          className="max-h-44 min-h-[46px] w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-[#0d0d0d] outline-none placeholder:text-[#9b9b9b]"
          disabled={isSending}
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAttachClick}
              disabled={isSending || isReadingFiles}
              className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              aria-label="Add image"
              title="Attach PNG, JPEG, WebP, or GIF"
            >
              {isReadingFiles ? "…" : "+"}
            </button>
            <button
              type="button"
              onClick={onHostedImageClick}
              disabled={isSending || isReadingFiles}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] disabled:cursor-not-allowed disabled:text-[#b6b6b6]"
              title="Attach hosted image URL"
            >
              URL
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleVoice}
              className="hidden h-8 w-8 items-center justify-center rounded-full text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] sm:flex"
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              title={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? (
                <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 18v3" />
                  <path d="M8 21h8" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white shadow-sm transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-white disabled:shadow-none"
              aria-label="Send message"
            >
              {isSending ? "…" : "↑"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[#8a8a8a]">
        {note || "AI can make mistakes. Check important info."}
      </p>
    </form>
  );
}
