import { cache } from "react";

import { getPublicProposalBySlug } from "@/lib/public-proposal-server";

export const getCachedPublicProposalBySlug = cache(getPublicProposalBySlug);
