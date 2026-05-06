import { useCallback, useRef } from "react";
import { useStore } from "../store";
import type { ChatMessage } from "../../shared/types";

export interface Attachment {
  name: string;
  dataUrl: string;
}

export function useSendMessage() {
  const addMessage = useStore((s) => s.addMessage);
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useStore((s) => s.setStreaming);
  const setActiveChatTaskId = useStore((s) => s.setActiveChatTaskId);
  const isStreaming = useStore((s) => s.isStreaming);
  const clearAgentState = useStore((s) => s.clearAgentState);
  const taskIdRef = useRef("");

  const send = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      if (!text.trim() && (!attachments || attachments.length === 0)) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: text || "[Image]",
        timestamp: Date.now(),
      };
      const tempTaskId = "pending-" + Date.now().toString(36);
      taskIdRef.current = tempTaskId;
      addMessage(userMsg, tempTaskId);

      const wasStreaming = isStreaming;
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: wasStreaming ? "[Queued]" : "",
        timestamp: Date.now(),
        blocks: [],
      };
      addMessage(assistantMsg, tempTaskId);

      if (!wasStreaming) {
        setStreaming(true);
      }

      try {
        if (window.electronAPI?.sendMessage) {
          const result = await window.electronAPI.sendMessage({ text, attachments });
          const realTaskId = result.messageId || tempTaskId;
          if (realTaskId !== tempTaskId) {
            useStore.setState((s) => {
              const temp = s.messagesByTaskId[tempTaskId] || [];
              const existing = s.messagesByTaskId[realTaskId] || [];
              const byId = { ...s.messagesByTaskId };
              byId[realTaskId] = [...existing, ...temp];
              delete byId[tempTaskId];
              return { messagesByTaskId: byId };
            });
          }
          // Only switch taskIdRef if no task was already running;
          // otherwise agent events from the running task must keep routing to its own messages.
          if (!wasStreaming) {
            taskIdRef.current = realTaskId;
            setActiveChatTaskId(realTaskId);
          }
        }
      } catch (err) {
        updateLastAssistantMessage(`**Error:** Failed to send message: ${err}`, taskIdRef.current);
        setStreaming(false);
        clearAgentState();
      }
    },
    [isStreaming, addMessage, setStreaming, setActiveChatTaskId, updateLastAssistantMessage, clearAgentState]
  );

  return { send, taskIdRef, isStreaming };
}
