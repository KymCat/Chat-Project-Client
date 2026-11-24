import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../features/admin/api";
import {
  memberStatusLabels,
  type PageResponse,
  reportReasonLabels,
  type MessageReportSummary,
} from "../features/admin/model";
import { getAdminReportDetailPath } from "../features/admin/routes";

const emptyPage: PageResponse<MessageReportSummary> = {
  content: [],
  page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
};

function parsePage(value: string | null) {
  const parsed = Number(value ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminReportListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get("page"));
  const [reports, setReports] = useState(emptyPage);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    adminApi.getReports(page)
      .then((response) => {
        if (!active) return;
        if (response.page.totalPages > 0 && page >= response.page.totalPages) {
          setSearchParams({ page: String(response.page.totalPages - 1) }, { replace: true });
          return;
        }
        setReports(response);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : "신고 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, setSearchParams]);

  const movePage = (nextPage: number) => {
    setSearchParams({ page: String(nextPage) });
  };

  return (
    <main className="admin-content">
      <section className="admin-panel" aria-labelledby="report-list-title">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-command">$ report --list --page {page}</p>
            <h2 id="report-list-title">신고 내역</h2>
          </div>
          <span>총 {reports.page.totalElements.toLocaleString()}건</span>
        </div>

        {error && <p className="admin-alert is-error" role="alert">{error}</p>}
        {isLoading ? (
          <p className="admin-empty" role="status">신고 내역을 불러오는 중입니다.</p>
        ) : reports.content.length === 0 ? (
          <p className="admin-empty">접수된 신고가 없습니다.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>사유</th>
                  <th>신고자</th>
                  <th>신고 대상</th>
                  <th>상태</th>
                  <th>접수 시각</th>
                  <th><span className="sr-only">상세</span></th>
                </tr>
              </thead>
              <tbody>
                {reports.content.map((report) => (
                  <tr key={report.reportId}>
                    <td>#{report.reportId}</td>
                    <td>{reportReasonLabels[report.reason]}</td>
                    <td>{report.reporterNickname}</td>
                    <td>{report.reportedMemberNickname}</td>
                    <td>
                      <span className={`admin-status is-${report.reportedMemberStatus.toLowerCase()}`}>
                        {memberStatusLabels[report.reportedMemberStatus]}
                      </span>
                    </td>
                    <td>{formatDateTime(report.createdAt)}</td>
                    <td>
                      <Link
                        className="admin-row-link"
                        to={getAdminReportDetailPath(report.reportId)}
                        state={{ fromPage: page }}
                      >
                        상세보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav className="admin-pagination" aria-label="신고 목록 페이지">
          <button
            type="button"
            onClick={() => movePage(page - 1)}
            disabled={isLoading || page === 0}
          >
            이전
          </button>
          <span>{reports.page.totalPages === 0 ? 0 : page + 1} / {reports.page.totalPages}</span>
          <button
            type="button"
            onClick={() => movePage(page + 1)}
            disabled={isLoading || page + 1 >= reports.page.totalPages}
          >
            다음
          </button>
        </nav>
      </section>
    </main>
  );
}

