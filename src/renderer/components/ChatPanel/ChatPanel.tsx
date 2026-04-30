import React, { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../../store";
import type { ChatMessage } from "../../../shared/types";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";

interface ChatPanelProps {
  onSettingsClick: () => void;
}

export function ChatPanel({ onSettingsClick }: ChatPanelProps) {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const addMessage = useStore((s) => s.addMessage);
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage);
  const appendBlockToLastAssistant = useStore((s) => s.appendBlockToLastAssistant);
  const updateToolCallBlock = useStore((s) => s.updateToolCallBlock);
  const setStreaming = useStore((s) => s.setStreaming);
  const addAgentAction = useStore((s) => s.addAgentAction);
  const updateAgentActionResult = useStore((s) => s.updateAgentActionResult);
  const setReviewRequest = useStore((s) => s.setReviewRequest);
  const setPlanItems = useStore((s) => s.setPlanItems);
  const clearAgentState = useStore((s) => s.clearAgentState);

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages or blocks arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent events and stream them into the assistant message
  useEffect(() => {
    if (!window.electronAPI?.onAgentEvent) return;
    const unsubscribe = window.electronAPI.onAgentEvent((event: any) => {
      switch (event.type) {
        case "thinking":
          // Only create thinking blocks for actual model reasoning, not generic status messages.
          // Generic status ("Turn k/n", "Waiting...") uses the plan field only.
          if (event.reasoning) {
            appendBlockToLastAssistant({
              type: "thinking",
              thinking: event.plan ?? "",
              reasoning: event.reasoning,
            });
          }
          break;

        case "tool-start":
          addAgentAction({
            toolCallId: event.toolCallId,
            tool: event.tool,
            args: event.args,
            status: "running",
            startTime: event.timestamp,
          });
          appendBlockToLastAssistant({
            type: "tool-call",
            toolCallId: event.toolCallId,
            tool: event.tool,
            args: event.args,
            status: "running",
          });
          break;

        case "tool-result":
          updateAgentActionResult(event.toolCallId, event.result, event.success);
          updateToolCallBlock(event.toolCallId, event.result, event.success, event.durationMs);
          break;

        case "response":
          // Streaming text response — continuously update the content
          updateLastAssistantMessage(event.text);
          break;

        case "review-required":
          setReviewRequest({
            reviewId: event.reviewId,
            reviewType: event.reviewType,
            title: event.title,
            description: event.description,
            content: event.content,
          });
          setStreaming(false);
          break;

        case "plan-update":
          setPlanItems(event.items);
          break;

        case "done":
          setStreaming(false);
          clearAgentState();
          break;

        case "error":
          updateLastAssistantMessage(`**Error:** ${event.message}`);
          setStreaming(false);
          clearAgentState();
          break;
      }
    });
    return unsubscribe;
  }, [
    addAgentAction,
    updateAgentActionResult,
    appendBlockToLastAssistant,
    updateToolCallBlock,
    updateLastAssistantMessage,
    setReviewRequest,
    setPlanItems,
    setStreaming,
    clearAgentState,
  ]);

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
        blocks: [],
      };
      addMessage(assistantMsg);
      setStreaming(true);

      setInputValue("");

      try {
        if (window.electronAPI?.sendMessage) {
          await window.electronAPI.sendMessage({ text });
        }
      } catch (err) {
        updateLastAssistantMessage(`**Error:** Failed to send message: ${err}`);
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
        {/* Keep the streaming indicator minimal — the assistant bubble handles its own pulse */}
        {isStreaming && (
          <div className="text-center text-xs text-gray-600">
            {messages[messages.length - 1]?.content ? "..." : ""}
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
        onSettingsClick={onSettingsClick}
      />
    </div>
  );
}
