import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path


RAG_API_PATH = Path(__file__).resolve().parents[1] / "rag_api.py"


class FakeRagPipeline:
    def __init__(self, _config_path: str):
        self.cfg = {
            "access_policy": {
                "alice": {"role": "admin", "projects": ["mim-llm", "ops"]},
                "service-bot": {"role": "service", "projects": ["mim-llm"]},
                "reader": {"role": "reviewer", "projects": ["mim-llm"]},
            }
        }

    def inventory(self):
        return [{"source": "/tmp/knowledge", "status": "ok", "files": 1}]

    def ingest(self):
        return {"files_ingested": 1, "chunks_ingested": 2, "projects": {"mim-llm": 2}, "errors": []}

    def search(self, query, top_k=5, project=None):
        project_name = project or "mim-llm"
        return {
            "query": query,
            "hits": [
                {
                    "score": 0.91,
                    "text": "Real Madrid gewann die Champions League 2026.",
                    "source": {
                        "title": "ucl.md",
                        "path": "/tmp/knowledge/mim-llm/ucl.md",
                        "project": project_name,
                    },
                },
                {
                    "score": 0.88,
                    "text": "Duplikat derselben Quelle.",
                    "source": {
                        "title": "ucl.md",
                        "path": "/tmp/knowledge/mim-llm/ucl.md",
                        "project": project_name,
                    },
                },
            ][: max(1, int(top_k))],
        }


def load_rag_api_module(module_name: str = "rag_api_test"):
    temp_dir = tempfile.TemporaryDirectory()
    base = Path(temp_dir.name)
    write_root = base / "knowledge"
    write_root.mkdir(parents=True, exist_ok=True)
    registry_path = base / "user_registry.json"

    os.environ["USER_REGISTRY_PATH"] = str(registry_path)
    os.environ["RAG_FS_WRITE_ROOTS"] = str(write_root)
    os.environ["RAG_CONFIG"] = str(base / "rag_config_unused.yaml")

    fake_mod = types.ModuleType("rag_pipeline")
    fake_mod.RagPipeline = FakeRagPipeline
    sys.modules["rag_pipeline"] = fake_mod

    spec = importlib.util.spec_from_file_location(module_name, str(RAG_API_PATH))
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    return module, temp_dir, write_root