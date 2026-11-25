import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../features/admin/api";
import { ReportImagePreview } from "../features/admin/ReportImagePreview";
import {
  memberStatusLabels,
  type MessageReportDetail,
  reportReasonLabels,
} from "../features/admin/model";
import { getAdminReportListPath } from "../features/admin/routes";
import { TerminalModalTransition } from "../shared/ui/TerminalModalTransition";

type AdminAction = "SUSPEND" | "DELETE";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function parseReportId(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function AdminReportDetailPage() {
  const { reportId: reportIdParam } = useParams();
  const reportId = parseReportId(reportIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const fromPage = (location.state as { fromPage?: number } | null)?.fromPage ?? 0;
  const [report, setReport] = useState<MessageReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (reportId === null) {
      setError("올바르지 않은 신고 번호입니다.");
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError("");

    adminApi.getReportDetail(reportId)
      .then((response) => {
        if (active) setReport(response);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : "신고 상세 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reportId]);

  const closeAction = () => {
    if (isSubmitting) return;
    setPendingAction(null);
    setActionError("");
  };

  const submitAction = async () => {
    if (reportId === null || pendingAction === null || isSubmitting) return;

    setIsSubmitting(true);
    setActionError("");
    try {
      if (pendingAction === "DELETE") {
        await adminApi.deleteReport(reportId);
        navigate(getAdminReportListPath(fromPage), { replace: true });
        return;
      }

      await adminApi.suspendReportedMember(reportId);
      setReport((current) => current
        ? { ...current, reportedMemberStatus: "SUSPENDED" }
        : current);
      setNotice("회원이 무기한 정지되었고 모든 로그인 Session이 종료되었습니다.");
      setPendingAction(null);
    } catch (requestError) {
      setActionError(requestError instanceof Error
        ? requestError.message
        : "관리자 작업을 처리하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-content">
      <Link className="admin-back-link" to={getAdminReportListPath(fromPage)}>
        ← 신고 목록
      </Link>

      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {notice && <p className="admin-alert is-success" role="status">{notice}</p>}
      {isLoading && <p className="admin-empty" role="status">신고 정보를 불러오는 중입니다.</p>}

      {report && (
        <article className="admin-detail">
          <header className="admin-panel-heading">
            <div>
              <p className="admin-command">$ report --show {report.reportId}</p>
              <h2>신고 #{report.reportId}</h2>
            </div>
            <span>{formatDateTime(report.reportedAt)}</span>
          </header>

          <div className="admin-detail-grid">
            <section className="admin-panel">
              <h3>신고 정보</h3>
              <dl className="admin-description-list">
                <div><dt>사유</dt><dd>{reportReasonLabels[report.reason]}</dd></div>
                <div><dt>상세</dt><dd>{report.details?.trim() || "작성된 상세 내용 없음"}</dd></div>
                <div><dt>신고자</dt><dd>{report.reporterNickname} (#{report.reporterId})</dd></div>
              </dl>
            </section>

            <section className="admin-panel">
              <h3>신고 대상 회원</h3>
              <dl className="admin-description-list">
                <div><dt>회원</dt><dd>{report.reportedMemberNickname} (#{report.reportedMemberId})</dd></div>
                <div><dt>이메일</dt><dd>{report.reportedMemberEmail}</dd></div>
                <div>
                  <dt>상태</dt>
                  <dd>
                    <span className={`admin-status is-${report.reportedMemberStatus.toLowerCase()}`}>
                      {memberStatusLabels[report.reportedMemberStatus]}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="admin-panel admin-message-panel">
              <h3>신고 메시지</h3>
              <dl className="admin-description-list">
                <div><dt>위치</dt><dd>채팅방 #{report.roomId} · 메시지 #{report.messageId}</dd></div>
                <div><dt>종류</dt><dd>{report.messageType}</dd></div>
                <div><dt>작성</dt><dd>{formatDateTime(report.messageCreatedAt)}</dd></div>
                <div><dt>수정</dt><dd>{formatDateTime(report.messageEditedAt)}</dd></div>
                <div><dt>현재 상태</dt><dd>{report.messageDeleted ? "삭제됨" : "유지 중"}</dd></div>
              </dl>
              <div className="admin-message-snapshot">
                <span>신고 당시 snapshot</span>
                <p>{report.messageContent ?? "텍스트 내용 없음"}</p>
                {report.attachment && (
                  <small>
                    첨부: {report.attachment.originalName} · {report.attachment.contentType}
                  </small>
                )}
              </div>
              {report.messageType === "IMAGE" && (
                report.attachment ? (
                  <ReportImagePreview
                    reportId={report.reportId}
                    attachment={report.attachment}
                  />
                ) : (
                  <p className="admin-report-image-missing">
                    이미지가 삭제되었거나 첨부 정보를 확인할 수 없습니다.
                  </p>
                )
              )}
            </section>
          </div>

          <footer className="admin-actions">
            <button
              type="button"
              onClick={() => setPendingAction("SUSPEND")}
              disabled={report.reportedMemberStatus !== "ACTIVE"}
            >
              회원 무기한 정지
            </button>
            <button
              className="is-danger"
              type="button"
              onClick={() => setPendingAction("DELETE")}
            >
              신고 내역 삭제
            </button>
          </footer>
        </article>
      )}

      <TerminalModalTransition
        visible={pendingAction !== null}
        className="admin-confirm-modal"
        onRequestClose={closeAction}
        dismissible={!isSubmitting}
      >
        {pendingAction && (
          <section className="admin-confirm-dialog" role="dialog" aria-modal="true">
            <p className="admin-command">
              {pendingAction === "SUSPEND" ? "$ member --suspend" : "$ report --delete"}
            </p>
            <h2>{pendingAction === "SUSPEND" ? "회원을 무기한 정지하시겠습니까?" : "신고를 영구 삭제하시겠습니까?"}</h2>
            <p>
              {pendingAction === "SUSPEND"
                ? "대상 회원의 모든 로그인 Session이 종료되며 다시 로그인할 수 없습니다."
                : "삭제한 신고 내역은 복구할 수 없습니다."}
            </p>
            {actionError && <p className="admin-alert is-error" role="alert">{actionError}</p>}
            <footer>
              <button type="button" onClick={closeAction} disabled={isSubmitting}>취소</button>
              <button
                className={pendingAction === "DELETE" ? "is-danger" : undefined}
                type="button"
                onClick={() => void submitAction()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "처리 중..." : "확인"}
              </button>
            </footer>
          </section>
        )}
      </TerminalModalTransition>
    </main>
  );
}

