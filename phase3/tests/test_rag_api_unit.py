import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from test_harness import load_rag_api_module


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        self.payload = {
            "choices": [{"message": {"content": "Real Madrid gewann 2026 [1]."}}],
            "model": "fake-router-model",
            "router_meta": {"provider": "stub"},
        }

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return _FakeResponse(self.payload, status_code=200)


class RagApiUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod, cls.tmp_dir, cls.write_root = load_rag_api_module("rag_api_test_unit")
        cls.client = TestClient(cls.mod.app)

    @classmethod
    def tearDownClass(cls):
        cls.tmp_dir.cleanup()

    def test_dedupe_local_hits(self):
        hits = [
            {"source": {"project": "mim-llm", "path": "/a.md", "title": "A"}},
            {"source": {"project": "mim-llm", "path": "/a.md", "title": "A"}},
            {"source": {"project": "mim-llm", "path": "/b.md", "title": "B"}},
        ]
        deduped = self.mod._dedupe_local_hits(hits)
        self.assertEqual(2, len(deduped))

    def test_web_query_rewrite_for_intelligence_questions(self):
        rewritten = self.mod._rewrite_web_query("wer ist der schlauste mensch")
        self.assertIn("iq", rewritten)

    def test_filter_relevant_web_hits_prefers_matching_entries(self):
        hits = [
            {"title": "Die Zauberer vom Waverly Place", "url": "https://de.wikipedia.org/wiki/Die_Zauberer_vom_Waverly_Place", "snippet": "US-Serie"},
            {"title": "Intelligenzquotient", "url": "https://de.wikipedia.org/wiki/Intelligenzquotient", "snippet": "IQ ist ein Kennwert..."},
        ]
        filtered = self.mod._filter_relevant_web_hits("wer ist der schlauste mensch", hits, 5)
        self.assertTrue(filtered)
        self.assertEqual("Intelligenzquotient", filtered[0].get("title"))

    def test_enforce_project_requires_explicit_project_for_multi_project_user(self):
        with self.assertRaises(self.mod.HTTPException) as err:
            self.mod._enforce_project("alice", None)
        self.assertEqual(400, err.exception.status_code)

    def test_identity_accepts_user_at_suffix_alias(self):
        user, role = self.mod._identity("alice@github", "admin")
        self.assertEqual("alice", user)
        self.assertEqual("admin", role)

    def test_healthz(self):
        r = self.client.get("/healthz")
        self.assertEqual(200, r.status_code)
        self.assertTrue(r.json().get("ok"))

    def test_search_requires_identity(self):
        r = self.client.post("/v1/rag/search", json={"query": "x", "project": "mim-llm"})
        self.assertEqual(401, r.status_code)

    def test_search_accepts_alias_identity(self):
        r = self.client.post(
            "/v1/rag/search",
            json={"query": "x", "project": "mim-llm"},
            headers={"x-user": "alice@github", "x-role": "admin"},
        )
        self.assertEqual(200, r.status_code)

    def test_fs_write_role_guard(self):
        r = self.client.post(
            "/v1/rag/fs/write",
            json={"path": "note.md", "content": "hello", "project": "mim-llm"},
            headers={"x-user": "reader", "x-role": "reviewer"},
        )
        self.assertEqual(403, r.status_code)

    def test_fs_write_success(self):
        target = str(self.write_root / "note.md")
        r = self.client.post(
            "/v1/rag/fs/write",
            json={"path": target, "content": "hello", "project": "mim-llm"},
            headers={
                "x-user": "service-bot",
                "x-role": "service",
                "x-reason": "smoke",
                "x-task-id": "T-001",
            },
        )
        self.assertEqual(200, r.status_code)
        body = r.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual("mim-llm", body.get("project"))

    def test_answer_source_strategy_web_first(self):
        web_hits = [{"title": "Wiki", "url": "https://w.example/ucl", "snippet": "Champions League 2026..."}]
        with patch.object(self.mod.httpx, "AsyncClient", _FakeAsyncClient):
            with patch.object(self.mod, "_web_search_snippets", AsyncMock(return_value=web_hits)):
                r = self.client.post(
                    "/v1/rag/answer",
                    json={
                        "query": "wer hat die champions league 2026 gewonnen",
                        "project": "mim-llm",
                        "use_web": True,
                        "web_top_k": 3,
                    },
                    headers={"x-user": "reader", "x-role": "reviewer"},
                )
        self.assertEqual(200, r.status_code)
        body = r.json()
        self.assertEqual("web_first", body.get("source_strategy"))
        self.assertEqual(1, body.get("web_hits"))
        self.assertTrue(body.get("sources"))
        self.assertEqual("web", body["sources"][0].get("project"))

    def test_answer_year_guard(self):
        class _MismatchingYearClient(_FakeAsyncClient):
            async def post(self, *args, **kwargs):
                payload = {
                    "choices": [{"message": {"content": "Der Gewinner war 2025 [1]."}}],
                    "model": "fake-router-model",
                }
                return _FakeResponse(payload, status_code=200)

        with patch.object(self.mod.httpx, "AsyncClient", _MismatchingYearClient):
            with patch.object(self.mod, "_web_search_snippets", AsyncMock(return_value=[])):
                r = self.client.post(
                    "/v1/rag/answer",
                    json={"query": "wer gewann 2026", "project": "mim-llm", "use_web": False},
                    headers={"x-user": "reader", "x-role": "reviewer"},
                )
        self.assertEqual(200, r.status_code)
        self.assertIn("Unklar im Kontext fuer das Jahr 2026.", r.json().get("answer", ""))

    def test_subjective_web_query_gets_explanatory_fallback(self):
        class _UnklarClient(_FakeAsyncClient):
            async def post(self, *args, **kwargs):
                payload = {
                    "choices": [{"message": {"content": "Unklar im Kontext."}}],
                    "model": "fake-router-model",
                }
                return _FakeResponse(payload, status_code=200)

        web_hits = [{"title": "Intelligenzquotient", "url": "https://de.wikipedia.org/wiki/Intelligenzquotient", "snippet": "IQ"}]
        with patch.object(self.mod.httpx, "AsyncClient", _UnklarClient):
            with patch.object(self.mod, "_web_search_snippets", AsyncMock(return_value=web_hits)):
                r = self.client.post(
                    "/v1/rag/answer",
                    json={
                        "query": "wer ist der schlauste mensch. liste die 10 schlausten",
                        "project": "mim-llm",
                        "use_web": True,
                        "web_top_k": 3,
                    },
                    headers={"x-user": "reader", "x-role": "reviewer"},
                )
        self.assertEqual(200, r.status_code)
        self.assertIn("keine wissenschaftlich eindeutige", r.json().get("answer", "").lower())


if __name__ == "__main__":
    unittest.main()