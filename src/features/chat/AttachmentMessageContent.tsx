import { useEffect, useState } from "react";
import { chatRoomApi, type ChatMessage } from "./api";

interface AttachmentMessageContentProps {
  message: ChatMessage;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AttachmentMessageContent({
  message,
}: AttachmentMessageContentProps) {
  const attachment = message.attachment;
  const isImage = message.type === "IMAGE";
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!attachment || !isImage) return;

    let disposed = false;
    let objectUrl = "";
    setLoadError("");

    void chatRoomApi
      .downloadAttachment(message.roomId, attachment.attachmentId)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setImageBlob(blob);
        setImageUrl(objectUrl);
      })
      .catch((downloadError) => {
        if (disposed) return;
        setLoadError(
          downloadError instanceof Error
            ? downloadError.message
            : "이미지를 불러오지 못했습니다.",
        );
      });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, isImage, message.roomId]);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPreviewOpen]);

  if (!attachment) {
    return <p className="deleted-message">삭제된 메시지입니다.</p>;
  }

  const handleDownload = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setLoadError("");
    try {
      const blob = imageBlob ?? await chatRoomApi.downloadAttachment(
        message.roomId,
        attachment.attachmentId,
      );
      saveBlob(blob, attachment.originalName);
    } catch (downloadError) {
      setLoadError(
        downloadError instanceof Error
          ? downloadError.message
          : "파일을 다운로드하지 못했습니다.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (isImage) {
    return (
      <>
        <div className="attachment-content image-attachment-content">
          {imageUrl ? (
            <button
              className="attachment-image-button"
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={`${attachment.originalName} 미리보기`}
            >
              <img src={imageUrl} alt={attachment.originalName} />
            </button>
          ) : (
            <div className="attachment-image-placeholder">
              {loadError || "이미지를 불러오는 중..."}
            </div>
          )}
          <span>{attachment.originalName}</span>
        </div>

        {isPreviewOpen && imageUrl && (
          <div
            className="attachment-preview-modal"
            role="presentation"
            onClick={() => setIsPreviewOpen(false)}
          >
            <section
              className="attachment-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`${attachment.originalName} 이미지 미리보기`}
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <strong>{attachment.originalName}</strong>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  aria-label="이미지 미리보기 닫기"
                >
                  ×
                </button>
              </header>
              <div className="attachment-preview-image">
                <img src={imageUrl} alt={attachment.originalName} />
              </div>
              <footer>
                <span>{formatFileSize(attachment.sizeBytes)}</span>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                >
                  {isDownloading ? "다운로드 중..." : "다운로드"}
                </button>
              </footer>
              {loadError && <p role="alert">{loadError}</p>}
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="attachment-content file-attachment-content">
      <span className="attachment-file-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M7 3h7l4 4v14H7V3Zm7 0v5h5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="attachment-file-info">
        <strong>{attachment.originalName}</strong>
        <small>{formatFileSize(attachment.sizeBytes)}</small>
      </span>
      <button
        className="attachment-download-button"
        type="button"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
      >
        {isDownloading ? "받는 중" : "다운로드"}
      </button>
      {loadError && <small className="attachment-load-error">{loadError}</small>}
    </div>
  );
}
