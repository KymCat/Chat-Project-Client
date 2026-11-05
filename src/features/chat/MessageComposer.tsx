import {
  type ChangeEvent,
  type FormEvent,
  useRef,
  useState,
} from "react";
import type { ChatRoomResponse } from "./api";
import { ChatAvatar } from "./ChatAvatar";

interface MessageComposerProps {
  activeRoom: ChatRoomResponse | null;
  isConnected: boolean;
  isActiveRoomDeleted: boolean;
  isUploadingAttachment: boolean;
  sendBlockedReason: string;
  nickname: string;
  ownProfileImageUrl: string | null;
  error: string;
  onSend: (content: string) => boolean;
  onAttachmentSelection: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function MessageComposer({
  activeRoom,
  isConnected,
  isActiveRoomDeleted,
  isUploadingAttachment,
  sendBlockedReason,
  nickname,
  ownProfileImageUrl,
  error,
  onSend,
  onAttachmentSelection,
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const isComposerDisabled = !activeRoom
    || !isConnected
    || isActiveRoomDeleted
    || Boolean(sendBlockedReason);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || !onSend(content)) return;
    setMessage("");
  };

  return (
    <footer className="composer-area">
      {(sendBlockedReason || error) && (
        <p className="chat-error" role="alert">
          {sendBlockedReason || error}
        </p>
      )}
      <form className="message-composer" onSubmit={handleSubmit}>
        <input
          ref={attachmentInputRef}
          className="attachment-file-input"
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.zip,.docx,.xlsx,.pptx"
          onChange={onAttachmentSelection}
          disabled={isComposerDisabled || isUploadingAttachment}
        />
        <ChatAvatar
          name={nickname}
          imageUrl={ownProfileImageUrl}
          className="terminal-composer-avatar"
        />
        <span className="terminal-composer-prompt" aria-hidden="true">$</span>
        <label className="sr-only" htmlFor="message">메시지</label>
        <input
          className="terminal-message-input"
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={sendBlockedReason
            ? "친구 관계가 해제되어 메시지를 보낼 수 없습니다"
            : activeRoom
              ? `${activeRoom.name ?? "Direct"}에 메시지 보내기`
              : "채팅방을 선택해주세요"}
          disabled={isComposerDisabled}
        />
        <button
          className="attachment-upload-button"
          type="button"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={isComposerDisabled || isUploadingAttachment}
          aria-label="첨부파일 보내기"
          title={isUploadingAttachment ? "업로드 중..." : "첨부파일 보내기"}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m8.5 12.5 6.9-6.9a3.2 3.2 0 0 1 4.5 4.5l-9.4 9.4a5 5 0 0 1-7.1-7.1l9-9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="send-message-button"
          type="submit"
          disabled={isComposerDisabled || !message.trim()}
          aria-label="메시지 보내기"
        >
          <span aria-hidden="true">↵</span>
        </button>
      </form>
    </footer>
  );
}
