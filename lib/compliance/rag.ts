/**
 * lib/compliance/rag.ts — Compliance RAG retrieval (re-export facade)
 *
 * The full TF-IDF knowledge base and retrieval engine live in lib/rag.ts.
 * This module re-exports the public API under the compliance/ namespace so
 * that consumers import from a semantically meaningful path and the
 * knowledge base can be moved or replaced without touching import sites.
 *
 * Usage:
 *   import { retrieveCompliance, buildRetrievalQuery } from "@/lib/compliance/rag";
 */

export {
  retrieveCompliance,
  buildRetrievalQuery,
  type ComplianceChunk,
  type RetrievalResult,
} from "@/lib/rag";
