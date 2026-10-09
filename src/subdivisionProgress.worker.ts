import {
  subdivisionProgress,
  type SubdivisionPackage,
  type SubdivisionProgress,
} from "./subdivisions";
import type { DiscoveryCell } from "./types";

export type SubdivisionProgressRequest = {
  requestId: number;
  regionId: string;
  data: SubdivisionPackage;
  cells: DiscoveryCell[];
};

export type SubdivisionProgressResponse =
  | {
      requestId: number;
      regionId: string;
      progresses: SubdivisionProgress[];
      error: null;
    }
  | {
      requestId: number;
      regionId: string;
      progresses: null;
      error: string;
    };

function calculateSubdivisionProgress(
  request: SubdivisionProgressRequest,
): SubdivisionProgressResponse {
  try {
    return {
      requestId: request.requestId,
      regionId: request.regionId,
      progresses: subdivisionProgress(request.data, request.cells),
      error: null,
    };
  } catch (error: unknown) {
    return {
      requestId: request.requestId,
      regionId: request.regionId,
      progresses: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

self.addEventListener(
  "message",
  (event: MessageEvent<SubdivisionProgressRequest>) => {
    self.postMessage(calculateSubdivisionProgress(event.data));
  },
);
