import React, { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../../store";
import { MessageBubble } from "./MessageBubble";
import { InputBar, type Attachment } from "./InputBar";
import { useSendMessage } from "../../hooks/useSendMessage";

interface ChatPanelProps {
  onSettingsClick: () => void;
}

export function ChatPanel({ onSettingsClick }: ChatPanelProps) {
  const messagesByTaskId = useStore((s) => s.messagesByTaskId);
  const activeChatTaskId = useStore((s) => s.activeChatTaskId);
  const messages = messagesByTaskId[activeChatTaskId] || [];

  const appendBlockToLastAssistant = useStore((s) => s.appendBlockToLastAssistant);
  const updateToolCallBlock = useStore((s) => s.updateToolCallBlock);
  const setStreaming = useStore((s) => s.setStreaming);
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage);
  const addAgentAction = useStore((s) => s.addAgentAction);
  const updateAgentActionResult = useStore((s) => s.updateAgentActionResult);
  const setAgentThinking = useStore((s) => s.setAgentThinking);
  const setReviewRequest = useStore((s) => s.setReviewRequest);
  const setPlanItems = useStore((s) => s.setPlanItems);
  const clearAgentState = useStore((s) => s.clearAgentState);

  const { send, taskIdRef, isStreaming } = useSendMessage();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent events and stream them into the assistant message
  useEffect(() => {
    if (!window.electronAPI?.onAgentEvent) return;
    const unsubscribe = window.electronAPI.onAgentEvent((event: any) => {
      const tid = event.taskId || taskIdRef.current || "";
      switch (event.type) {
        case "thinking":
          if (event.reasoning) {
            appendBlockToLastAssistant({
              type: "thinking",
              thinking: event.plan ?? "",
              reasoning: event.reasoning,
            }, tid);
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
          }, tid);
          break;

        case "tool-progress":
          if (event.progressType === "thinking") {
            setAgentThinking(event.content);
          }
          break;

        case "tool-result":
          updateAgentActionResult(event.toolCallId, event.result, event.success);
          updateToolCallBlock(event.toolCallId, event.result, event.success, event.durationMs, tid);
          break;

        case "response":
          updateLastAssistantMessage(event.text, tid);
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
          updateLastAssistantMessage(`**Error:** ${event.message}`, tid);
          setStreaming(false);
          clearAgentState();
          break;
      }
    });
    return unsubscribe;
  }, [
    taskIdRef,
    appendBlockToLastAssistant,
    updateToolCallBlock,
    setStreaming,
    updateLastAssistantMessage,
    addAgentAction,
    updateAgentActionResult,
    setAgentThinking,
    setReviewRequest,
    setPlanItems,
    clearAgentState,
  ]);

  const handleSend = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      setInputValue("");
      await send(text, attachments);
    },
    [send]
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
              <p className="text-lg mb-2">Corona</p>
              <p>Type a command or use voice input.</p>
              <p className="mt-1 text-xs">Try: "Go to wikipedia.org and search for TypeScript"</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
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
