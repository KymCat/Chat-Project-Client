import { type FormEvent, useEffect, useState } from "react";
import { TerminalModalTransition } from "../../shared/ui/TerminalModalTransition";
import {
  chatRoomApi,
  type ChatMessage,
  type MessageReportReason,
} from "./api";

interface MessageReportModalProps {
  target: ChatMessage | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const reasonOptions: Array<{ value: MessageReportReason; label: string }> = [
  { value: "ABUSE", label: "욕설 및 비방" },
  { value: "SPAM", label: "스팸" },
  { value: "SEXUAL_CONTENT", label: "성적 콘텐츠" },
  { value: "OTHER", label: "기타" },
];

export function MessageReportModal({
  target,
  onClose,
  onSubmitted,
}: MessageReportModalProps) {
  const [reason, setReason] = useState<MessageReportReason | "">("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setReason("");
    setDetail("");
    setError("");
  }, [target?.messageId]);

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !reason || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      await chatRoomApi.reportMessage(target.roomId, target.messageId, {
        reason,
        detail: detail || null,
      });
      onSubmitted();
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "메시지를 신고하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TerminalModalTransition
      visible={target !== null}
      className="message-report-modal"
      onRequestClose={close}
      dismissible={!isSubmitting}
    >
      {target && (
        <form
          className="message-report-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-report-title"
          onSubmit={(event) => void submit(event)}
        >
          <p className="eyebrow">$ message --report {target.messageId}</p>
          <h2 id="message-report-title">메시지 신고</h2>
          <p className="message-report-description">
            신고 내용은 관리자가 확인하며, 같은 메시지는 한 번만 신고할 수 있습니다.
          </p>

          <label>
            <span>신고 사유</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as MessageReportReason | "")}
              disabled={isSubmitting}
              required
            >
              <option value="">사유를 선택해주세요</option>
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>상세 내용 <small>(선택)</small></span>
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={500}
              rows={5}
              disabled={isSubmitting}
              placeholder="관리자가 판단할 때 참고할 내용을 입력해주세요."
            />
            <small className="message-report-count">{detail.length}/500</small>
          </label>

          {error && <p className="message-report-error" role="alert">{error}</p>}

          <footer>
            <button type="button" onClick={close} disabled={isSubmitting}>취소</button>
            <button type="submit" disabled={!reason || isSubmitting}>
              {isSubmitting ? "신고 중..." : "신고 접수"}
            </button>
          </footer>
        </form>
      )}
    </TerminalModalTransition>
  );
}

