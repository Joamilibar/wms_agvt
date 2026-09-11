"""PreToolUse hook: remind Claude to consult the graphify knowledge graph.

Shell-agnostic replacement for the POSIX one-liner that `graphify claude install`
writes by default -- that version is a parse error under PowerShell/cmd on Windows.
Prints nothing (and exits 0) when no graph has been built yet.
"""
import json
import os

if os.path.isfile(os.path.join("graphify-out", "graph.json")):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": (
                "graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md "
                "for god nodes and community structure before searching raw files."
            ),
        }
    }))
