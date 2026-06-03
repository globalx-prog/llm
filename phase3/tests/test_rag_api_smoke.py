import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from test_harness import load_rag_api_module


class _SmokeRouterResponse:
    status_code = 200

    def json(self):
        return {
            "choices": [{"message": {"content": "Smoke-Antwort 2026 [1]."}}],
            "model": "smoke-model",
        }


class _SmokeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return _SmokeRouterResponse()


class RagApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod, cls.tmp_dir, cls.write_root = load_rag_api_module("rag_api_test_smoke")
        cls.client = TestClient(cls.mod.app)

    @classmethod
    def tearDownClass(cls):
        cls.tmp_dir.cleanup()

    def test_smoke_health_inventory_search_answer_write(self):
        headers_reader = {"x-user": "reader", "x-role": "reviewer"}
        headers_service = {
            "x-user": "service-bot",
            "x-role": "service",
            "x-reason": "smoke",
            "x-task-id": "SMOKE-1",
        }

        health = self.client.get("/healthz")
        self.assertEqual(200, health.status_code)
        self.assertTrue(health.json().get("ok"))

        inv = self.client.post("/v1/rag/inventory", headers=headers_reader)
        self.assertEqual(200, inv.status_code)
        self.assertIn("inventory", inv.json())

        search = self.client.post(
            "/v1/rag/search",
            json={"query": "champions league", "project": "mim-llm", "top_k": 2},
            headers=headers_reader,
        )
        self.assertEqual(200, search.status_code)
        self.assertGreaterEqual(len(search.json().get("hits", [])), 1)

        with patch.object(self.mod.httpx, "AsyncClient", _SmokeAsyncClient):
            with patch.object(
                self.mod,
                "_web_search_snippets",
                AsyncMock(return_value=[{"title": "Web", "url": "https://example.org", "snippet": "2026"}]),
            ):
                ans = self.client.post(
                    "/v1/rag/answer",
                    json={
                        "query": "wer hat die champions league 2026 gewonnen",
                        "project": "mim-llm",
                        "use_web": True,
                        "web_top_k": 1,
                    },
                    headers=headers_reader,
                )
        self.assertEqual(200, ans.status_code)
        self.assertIn("source_strategy", ans.json())

        target = str(self.write_root / "smoke-output.md")
        write = self.client.post(
            "/v1/rag/fs/write",
            json={"path": target, "content": "smoke ok", "project": "mim-llm"},
            headers=headers_service,
        )
        self.assertEqual(200, write.status_code)
        self.assertTrue(write.json().get("ok"))


if __name__ == "__main__":
    unittest.main()