import { useEffect, useState } from "react";
import { TerminalModalTransition } from "../../shared/ui/TerminalModalTransition";
import { adminApi } from "./api";
import type { ReportAttachment } from "./model";

interface ReportImagePreviewProps {
  reportId: number;
  attachment: ReportAttachment;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_048_576) {
    return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
}

export function ReportImagePreview({
  reportId,
  attachment,
}: ReportImagePreviewProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";

    setImageUrl("");
    setIsLoading(true);
    setError("");
    setIsPreviewOpen(false);

    adminApi.getReportAttachment(reportId)
      .then((blob) => {
        const nextUrl = URL.createObjectURL(blob);
        if (disposed) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        objectUrl = nextUrl;
        setImageUrl(nextUrl);
      })
      .catch((requestError) => {
        if (!disposed) {
          setError(requestError instanceof Error
            ? requestError.message
            : "신고 이미지를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reportId]);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPreviewOpen]);

  return (
    <section className="admin-report-image" aria-labelledby="report-image-title">
      <div className="admin-report-image-heading">
        <div>
          <span id="report-image-title">신고 이미지</span>
          <small>{attachment.originalName} · {formatFileSize(attachment.sizeBytes)}</small>
        </div>
        {imageUrl && (
          <button type="button" onClick={() => setIsPreviewOpen(true)}>
            원본 보기
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="admin-report-image-placeholder" role="status">
          이미지를 불러오는 중입니다.
        </div>
      ) : error ? (
        <div className="admin-report-image-placeholder is-error" role="alert">
          {error}
        </div>
      ) : (
        <button
          className="admin-report-image-thumbnail"
          type="button"
          onClick={() => setIsPreviewOpen(true)}
          aria-label={`${attachment.originalName} 원본 보기`}
        >
          <img src={imageUrl} alt={attachment.originalName} />
        </button>
      )}

      <TerminalModalTransition
        visible={isPreviewOpen && Boolean(imageUrl)}
        className="admin-image-preview-modal"
        onClick={() => setIsPreviewOpen(false)}
      >
        <section
          className="admin-image-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`${attachment.originalName} 이미지 원본`}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <strong>{attachment.originalName}</strong>
              <small>{formatFileSize(attachment.sizeBytes)}</small>
            </div>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              aria-label="이미지 원본 닫기"
            >
              ×
            </button>
          </header>
          <div className="admin-image-preview-content">
            <img src={imageUrl} alt={attachment.originalName} />
          </div>
        </section>
      </TerminalModalTransition>
    </section>
  );
}

