import { ApiError, httpClient } from "../../shared/api/httpClient";
import type {
  MessageReportDetail,
  MessageReportSummary,
  PageResponse,
} from "./model";

export const adminApi = {
  checkAccess: async () => {
    try {
      await httpClient.get<void>("/admin/access");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) return false;
      throw error;
    }
  },
  getReports: (page: number) =>
    httpClient.get<PageResponse<MessageReportSummary>>(
      `/admin/reports?page=${page}`,
    ),
  getReportDetail: (reportId: number) =>
    httpClient.get<MessageReportDetail>(`/admin/reports/${reportId}`),
  getReportAttachment: (reportId: number) =>
    httpClient.getBlob(`/admin/reports/${reportId}/attachment`),
  deleteReport: (reportId: number) =>
    httpClient.delete<void>(`/admin/reports/${reportId}`),
  suspendReportedMember: (reportId: number) =>
    httpClient.patch<void>(`/admin/reports/${reportId}/suspension`),
};

