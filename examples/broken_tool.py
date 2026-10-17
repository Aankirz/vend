"""Demo seller tool with one realistic bug for the packaging agent to fix."""
import base64
import io

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def make_chart(data, title, kind="bar"):
    """Return the chart as a base64-encoded PNG string.

    data: list of {"label": str, "value": number}; kind: "bar" or "line".
    """
    if kind not in ("bar", "line"):
        raise ValueError(f"kind must be 'bar' or 'line', got {kind!r}")
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
    # Bug: returns bytes, not str — json.dumps in any HTTP wrapper blows up on it.
    return base64.b64encode(buf.getvalue())
