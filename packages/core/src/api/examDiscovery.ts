import { apiFetch } from "./client";

/** Mirrors ExamDiscoveryService.SortOption on the backend exactly. */
export type ExamSortOption =
  | "DEADLINE"
  | "EXAM_DATE"
  | "NEWLY_ANNOUNCED"
  | "RECENTLY_UPDATED"
  | "POPULAR"
  | "ALPHABETICAL";

export type ExamCard = {
  examCode: string;
  examName: string;
  imageUrl: string | null;
  category: string | null;
  difficulty: string | null;
  badge: string | null;
  recruitmentCycleId: string | null;
  cycleName: string | null;
  status: string | null;
  closingSoon: boolean;
  daysUntilDeadline: number | null;
  notificationDate: string | null;
  applicationStart: string | null;
  applicationEnd: string | null;
  examStart: string | null;
  examEnd: string | null;
  vacancyCount: number | null;
  demo: boolean;
  lastVerifiedAt: string | null;
  /** "APPLY_NOW" | "PREPARE_NOW" | "VIEW_EXAM" | "VIEW_RESULT_INFO" */
  primaryAction: string;
};

export type PagedExamCards = {
  content: ExamCard[];
  page: number;
  size: number;
  totalElements: number;
  hasMore: boolean;
};

type DiscoverParams = {
  page?: number;
  size?: number;
  sort?: ExamSortOption;
  /** A RecruitmentCycleStatus name, or the synthetic "CLOSING_SOON" bucket. */
  status?: string;
  category?: string;
};

/**
 * The Exams module's own listing (`GET /api/exams/discover`) — deliberately public, no
 * auth header, same as the plain `GET /api/exams` Home already calls. Real server-side
 * pagination/sort/filter per the user's explicit choice, even at today's ~11-exam scale.
 */
export function discoverExams(params: DiscoverParams = {}): Promise<PagedExamCards> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.size !== undefined) query.set("size", String(params.size));
  if (params.sort) query.set("sort", params.sort);
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);

  const qs = query.toString();
  return apiFetch<PagedExamCards>(`/exams/discover${qs ? `?${qs}` : ""}`);
}
