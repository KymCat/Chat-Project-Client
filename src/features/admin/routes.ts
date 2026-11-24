export const ADMIN_CONSOLE_PATH = "/admin";
export const ADMIN_REPORTS_PATH = `${ADMIN_CONSOLE_PATH}/reports`;

export function getAdminReportListPath(page = 0) {
  return `${ADMIN_REPORTS_PATH}?page=${page}`;
}

export function getAdminReportDetailPath(reportId: number) {
  return `${ADMIN_REPORTS_PATH}/${reportId}`;
}

