"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { copyText } from "@/lib/clipboard";

function formatCodeLanguage(language: string) {
  const labels: Record<string, string> = {
    bash: "Bash",
    css: "CSS",
    html: "HTML",
    js: "JavaScript",
    javascript: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    md: "Markdown",
    markdown: "Markdown",
    py: "Python",
    python: "Python",
    sh: "Shell",
    shell: "Shell",
    sql: "SQL",
    ts: "TypeScript",
    tsx: "TSX",
    txt: "Text",
    yaml: "YAML",
    yml: "YAML"
  };

  return labels[language.toLowerCase()] || language;
}

function MarkdownCodeBlock({
  code,
  language,
  isUser
}: {
  code: string;
  language?: string;
  isUser: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`code-block my-4 overflow-hidden rounded-xl border ${
        isUser
          ? "border-white/20 bg-black/20"
          : "border-[#e5e5e5] bg-[#f7f7f8]"
      }`}
    >
      <div
        className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${
          isUser ? "border-white/15" : "border-[#ececec] bg-[#f3f3f4]"
        }`}
      >
        <span
          className={`text-xs font-medium uppercase tracking-wide ${
            isUser ? "text-white/70" : "text-[#666]"
          }`}
        >
          {language ? formatCodeLanguage(language) : "Code"}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`rounded-md px-2 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 ${
            isUser
              ? "text-white/80 hover:bg-white/10 hover:text-white focus:ring-white/30"
              : "text-[#555] hover:bg-white hover:text-[#111] focus:ring-[#d9d9d9]"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`overflow-x-auto text-[0.875rem] leading-6 ${
          isUser ? "text-white" : "text-[#16181d]"
        }`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownMessage({
  content,
  isUser
}: {
  content: string;
  isUser: boolean;
}) {
  return (
    <div
      className={`message-content w-full min-w-0 text-[15px] leading-7 ${
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
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const code = String(children).replace(/\n$/, "");
            const languageMatch = /language-([\w+-]+)/.exec(className || "");
            const isBlock = Boolean(languageMatch) || code.includes("\n");

            if (!isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <MarkdownCodeBlock
                code={code}
                language={languageMatch?.[1]}
                isUser={isUser}
              />
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
