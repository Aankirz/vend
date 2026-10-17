"""Demo seller tool: render a bar or line chart and return it as a base64 PNG."""
import base64
import io
import json
import urllib.error
import urllib.request

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def make_chart(data=None, title="", kind="bar", source_url=None):
    """data: list of {"label": str, "value": number}; kind: "bar" or "line".
    source_url: optional URL returning that list as JSON, used instead of data."""
    if kind not in ("bar", "line"):
        raise ValueError(f"kind must be 'bar' or 'line', got {kind!r}")
    if source_url:
        try:
            with urllib.request.urlopen(source_url, timeout=5) as resp:
                data = json.load(resp)
        except urllib.error.HTTPError as err:
            raise ValueError(f"source_url returned HTTP {err.code}") from err
        except OSError as err:
            raise RuntimeError(f"network blocked: {err}") from err
    if not data:
        raise ValueError("data must be a non-empty list")
    labels = [str(point["label"]) for point in data]
    values = [float(point["value"]) for point in data]

    fig, ax = plt.subplots(figsize=(6, 4), dpi=100)
    if kind == "bar":
        ax.bar(labels, values, color="#635bff")
    else:
        ax.plot(labels, values, marker="o", color="#635bff")
    ax.set_title(title)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")
