import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { ApiError, apiClient } from '../api/apiClient';
import type { ChatCommand } from '../api/types';
import { useViewBridge, viewBridge } from '../utilities/viewBridge';

/** One line of the conversation shown in the box. */
interface ChatLine {
  role: 'user' | 'assistant' | 'notice';
  text: string;
}

/**
 * Carries out the chat's view commands in the order the model gave them.
 * @param commands The commands.
 */
function applyCommands(commands: ChatCommand[]): void {
  for (const command of commands) {
    if (command.type === 'show_order') {
      viewBridge.showOrder(command.parent_order_id);
    } else if (command.type === 'highlight') {
      if (command.clear === true) {
        viewBridge.setHighlight(null);
      } else {
        viewBridge.setHighlight({
          partPaths: command.part_paths,
          legIds: command.leg_ids,
        });
      }
    } else if (command.type === 'market_moment') {
      viewBridge.requestMarketMoment(command.moment);
    } else if (command.type === 'show_day') {
      viewBridge.showDay(command.day);
    } else if (command.type === 'focus_day_column') {
      viewBridge.focusDayColumn(command.day, command.synthetic_type, command.bucket_start);
    }
  }
}

/**
 * The chat box fixed to the bottom of the page: ask a question, and the 3D view changes to show the answer.
 * @returns The chat box.
 */
export function ChatBox() {
  const bridge = useViewBridge();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [disabledReason, setDisabledReason] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const transcriptReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiClient
      .chatStatus()
      .then((status) => {
        setEnabled(status.enabled);
        setDisabledReason(status.reason ?? '');
      })
      .catch(() => {
        setEnabled(false);
        setDisabledReason('The chat status could not be read.');
      });
  }, []);

  useEffect(() => {
    transcriptReference.current?.scrollTo({
      top: transcriptReference.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [lines, busy]);

  const send = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const question = draft.trim();
    if (question === '' || busy || enabled !== true) {
      return;
    }
    setDraft('');
    setOpen(true);
    setLines((previous) => [
      ...previous,
      {
        role: 'user',
        text: question,
      },
    ]);
    setBusy(true);
    const reported = bridge.reported;
    const highlight = bridge.highlight;
    try {
      const answer = await apiClient.chat(conversationId, question, {
        view: bridge.view,
        parent_order_id: reported.parentOrderId,
        highlighted_parts: highlight?.partPaths ?? [],
        highlighted_legs: highlight?.legIds ?? [],
        market_moment: reported.marketMoment,
        day: reported.day,
        column_type: reported.columnType,
        column_bucket_start: reported.columnBucketStart,
      });
      setConversationId(answer.conversation_id);
      applyCommands(answer.commands);
      setLines((previous) => [
        ...previous,
        {
          role: answer.refused ? 'notice' : 'assistant',
          text: answer.reply,
        },
      ]);
    } catch (caught) {
      setLines((previous) => [
        ...previous,
        {
          role: 'notice',
          text: caught instanceof ApiError ? caught.message : 'The server could not be reached.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const startOver = () => {
    setConversationId(null);
    setLines([]);
    viewBridge.setHighlight(null);
  };

  const showTranscript = open && (lines.length > 0 || busy);

  return (
    <div className="chat-dock">
      {showTranscript && (
        <div className="chat-transcript" ref={transcriptReference}>
          {lines.map((line, index) => (
            <div key={index} className={`chat-line chat-line-${line.role}`}>
              {line.text}
            </div>
          ))}
          {busy && (
            <div className="chat-line chat-line-assistant chat-thinking">
              Looking it up<span className="dots" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
      <form className="chat-bar" onSubmit={send}>
        {lines.length > 0 && (
          <button type="button" className="chat-icon-button" onClick={() => setOpen(!open)} title={open ? 'Hide the conversation' : 'Show the conversation'}>
            {open ? '▾' : '▴'}
          </button>
        )}
        <textarea
          className="chat-input"
          rows={3}
          value={draft}
          placeholder={enabled === false ? disabledReason : 'Ask about the orders, e.g. "Why was this plan cancelled?" or "Show me the busiest minute on 27 Sep"'}
          disabled={enabled !== true}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {lines.length > 0 && (
          <button type="button" className="chat-text-button" onClick={startOver} disabled={busy}>
            New chat
          </button>
        )}
        <button type="submit" className="chat-send" disabled={busy || enabled !== true || draft.trim() === ''} aria-label="Send">
          ↑
        </button>
      </form>
    </div>
  );
}
