import { cache } from "react";

import { getPublicProposalReportBySlug } from "@/lib/public-report-server";

/** Uma leitura por slug por request (compartilhado entre `generateMetadata` e a página). */
export const getCachedPublicProposalReportBySlug = cache(getPublicProposalReportBySlug);
