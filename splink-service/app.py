from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import pandas as pd

from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

app = FastAPI(title="DATALINK Splink Service", version="1.0.0")


class LinkRequest(BaseModel):
    left: list[dict] = Field(default_factory=list)
    right: list[dict] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


def comparison_for(field: str, kind: str):
    if kind == "exact":
        return cl.ExactMatch(field)
    if kind == "levenshtein":
        return cl.LevenshteinAtThresholds(field, [1, 2, 3])
    if kind == "jaro_winkler":
        return cl.JaroWinklerAtThresholds(field, [0.9, 0.8])
    raise ValueError(f"Unsupported comparison type: {kind}")


def build_settings(settings: dict):
    fields = settings.get("comparison_fields") or []
    if not fields:
        fields = [
            {"field": f, "type": "exact"}
            for f in (settings.get("identity_fields") or ["ean", "gtin", "barcode", "reference", "sku"])
        ]

    comparisons = []
    blocking = []

    for item in fields:
        field = item.get("field")
        if not field:
            continue
        comparisons.append(comparison_for(field, item.get("type", "exact")))

    blocking_fields = settings.get("blocking_fields")
    if blocking_fields is None:
        blocking_fields = [
            item.get("field")
            for item in fields
            if item.get("blocking", True) and item.get("field")
        ]

    for field in blocking_fields:
        blocking.append(block_on(field))

    if not comparisons:
        raise ValueError("At least one comparison field is required")
    if not blocking:
        raise ValueError("At least one blocking field is required for safety")

    return SettingsCreator(
        link_type="link_only",
        unique_id_column_name="_datalink_id",
        comparisons=comparisons,
        blocking_rules_to_generate_predictions=blocking,
        retain_intermediate_calculation_columns=False,
        retain_matching_columns=True,
    )


@app.get("/health")
def health():
    return {"status": "ok", "engine": "splink"}


@app.post("/v1/link")
def link(request: LinkRequest):
    if not request.left or not request.right:
        return {"version": "4.x", "pairs": [], "statistics": {"left": len(request.left), "right": len(request.right)}}

    left = pd.DataFrame(request.left).copy()
    right = pd.DataFrame(request.right).copy()

    if "_datalink_id" not in left.columns or "_datalink_id" not in right.columns:
        raise HTTPException(status_code=400, detail="_datalink_id is required on both datasets")

    settings = request.settings or {}
    comparison_fields = [
        item.get("field")
        for item in (settings.get("comparison_fields") or [])
        if item.get("field")
    ]
    if not comparison_fields:
        comparison_fields = settings.get("identity_fields") or ["ean", "gtin", "barcode", "reference", "sku"]

    missing = [
        field for field in comparison_fields
        if field not in left.columns or field not in right.columns
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"message": "Comparison fields are missing from one or both datasets", "fields": missing},
        )

    threshold = settings.get("threshold_match_probability")
    try:
        model = build_settings(settings)
        linker = Linker(
            [left, right],
            model,
            db_api=DuckDBAPI(),
            input_table_aliases=["left", "right"],
        )
        predictions = linker.inference.predict(
            threshold_match_probability=float(threshold) if threshold is not None else None
        )
        frame = predictions.as_pandas_dataframe()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    pairs = []
    for row in frame.to_dict(orient="records"):
        pairs.append({
            "left_id": str(row.get("_datalink_id_l")),
            "right_id": str(row.get("_datalink_id_r")),
            "match_probability": float(row["match_probability"]) if row.get("match_probability") is not None else None,
            "match_weight": float(row["match_weight"]) if row.get("match_weight") is not None else None,
        })

    return {
        "version": "4.x",
        "pairs": pairs,
        "statistics": {
            "left": len(left),
            "right": len(right),
            "pairs": len(pairs),
        },
    }
