import React, { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../../store";
import type { ChatMessage } from "../../../shared/types";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";

export function ChatPanel() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const addMessage = useStore((s) => s.addMessage);
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useStore((s) => s.setStreaming);
  const addAgentAction = useStore((s) => s.addAgentAction);
  const updateAgentActionResult = useStore((s) => s.updateAgentActionResult);
  const setAgentThinking = useStore((s) => s.setAgentThinking);
  const setReviewRequest = useStore((s) => s.setReviewRequest);
  const clearAgentState = useStore((s) => s.clearAgentState);

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent events
  useEffect(() => {
    if (!window.electronAPI?.onAgentEvent) return;
    const unsubscribe = window.electronAPI.onAgentEvent((event: any) => {
      switch (event.type) {
        case "thinking":
          setAgentThinking(event.plan ?? null);
          break;
        case "tool-start":
          addAgentAction({
            toolCallId: event.toolCallId,
            tool: event.tool,
            args: event.args,
            status: "running",
          });
          break;
        case "tool-result":
          updateAgentActionResult(event.toolCallId, event.result, event.success);
          break;
        case "response":
          updateLastAssistantMessage(event.text);
          setStreaming(false);
          clearAgentState();
          break;
        case "review-required":
          setReviewRequest({
            reviewId: event.reviewId,
            reviewType: event.reviewType,
            title: event.title,
            description: event.description,
            content: event.content,
          });
          break;
        case "error":
          updateLastAssistantMessage(`Error: ${event.message}`);
          setStreaming(false);
          clearAgentState();
          break;
        case "done":
          setStreaming(false);
          clearAgentState();
          break;
      }
    });
    return unsubscribe;
  }, [addAgentAction, updateAgentActionResult, setAgentThinking, setReviewRequest, setStreaming, updateLastAssistantMessage, clearAgentState]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      addMessage(assistantMsg);
      setStreaming(true);

      setInputValue("");

      try {
        if (window.electronAPI?.sendMessage) {
          await window.electronAPI.sendMessage({ text });
        }
      } catch (err) {
        updateLastAssistantMessage(`Failed to send message: ${err}`);
        setStreaming(false);
        clearAgentState();
      }
    },
    [isStreaming, addMessage, setStreaming, updateLastAssistantMessage, clearAgentState]
  );

  const handleAbort = useCallback(async () => {
    if (window.electronAPI?.abortAgent) {
      await window.electronAPI.abortAgent();
    }
    setStreaming(false);
    clearAgentState();
  }, [setStreaming, clearAgentState]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <p className="text-lg mb-2">Browser Secretary Agent</p>
              <p>Type a command or use voice to control the browser.</p>
              <p className="mt-1 text-xs">Try: "Go to wikipedia.org and search for TypeScript"</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && (
          <div className="flex items-center space-x-2 text-gray-500 text-sm px-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Agent is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <InputBar
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onAbort={handleAbort}
        isStreaming={isStreaming}
      />
    </div>
  );
}
