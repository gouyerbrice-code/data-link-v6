from pathlib import Path
import io
import os
import re

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse

BASE = Path(__file__).resolve().parent.parent
RULES_FILE = Path(os.getenv("RULES_FILE", BASE / "rules/50_duodecies.csv"))
UI_FILE = BASE / "ui/index.html"

app = FastAPI(title="Contrôle TVA — Article 50 duodecies", version="1.0.0")

COLUMN_ALIASES = [
    "code nc", "code_nc", "code douane", "code douanier", "nomenclature",
    "nomenclature douaniere", "nomenclature douanière", "ndp", "ndp fournisseur",
    "hs code", "tarif douanier", "tarif douaniere", "tarif douanière",
    "customs code", "commodity code"
]

def norm_text(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())

def normalize_nc(value):
    if value is None:
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) >= 4 else None

def position_nc(code):
    digits = normalize_nc(code)
    return f"{digits[:2]}-{digits[2:4]}" if digits else None

def detect_nc_column(df):
    normalized = {norm_text(c): c for c in df.columns}
    for alias in COLUMN_ALIASES:
        if norm_text(alias) in normalized:
            return normalized[norm_text(alias)]

    best, score = None, 0
    for column in df.columns:
        values = df[column].dropna().astype(str).head(500)
        if values.empty:
            continue
        good = sum(bool(re.search(r"\d{4,10}", value)) for value in values)
        ratio = good / len(values)
        if ratio > score:
            best, score = column, ratio
    return best if score >= 0.35 else None

def load_rules():
    if not RULES_FILE.exists():
        raise RuntimeError("Référentiel Article 50 duodecies introuvable.")
    rules = pd.read_csv(RULES_FILE, dtype=str).fillna("")
    required = {
        "position_nc", "source_position_article", "exclusion_ex",
        "type_regle", "territoire", "section", "regime",
        "taux_tva_import", "article", "date_debut"
    }
    missing = required - set(rules.columns)
    if missing:
        raise RuntimeError(f"Colonnes manquantes dans le référentiel : {sorted(missing)}")
    rules["position_digits"] = (
        rules["position_nc"].astype(str)
        .str.replace("-", "", regex=False)
        .str.replace(" ", "", regex=False)
    )
    rules["specificity"] = rules["position_digits"].str.len()
    return rules

def find_rule(code, territory="MQ"):
    digits = normalize_nc(code)
    if not digits:
        return None

    rules = load_rules()
    candidates = rules[
        rules["position_digits"].apply(
            lambda key: bool(key) and digits.startswith(key)
        )
    ].copy()

    if candidates.empty:
        return None

    territory_candidates = candidates[
        candidates["territoire"].str.contains(territory, case=False, na=False)
    ]
    if not territory_candidates.empty:
        candidates = territory_candidates

    max_specificity = candidates["specificity"].max()
    candidates = candidates[candidates["specificity"] == max_specificity]
    return candidates.iloc[0].to_dict()

def decide(code, territory="MQ"):
    digits = normalize_nc(code)
    pos = position_nc(code)

    if not digits:
        return {
            "nc_normalise": "", "position_nc": "",
            "correspondance": "CODE INVALIDE",
            "statut": "CODE_NC_INVALIDE",
            "action": "Corriger ou compléter le code douanier",
            "reference": ""
        }

    rule = find_rule(digits, territory)
    if not rule:
        return {
            "nc_normalise": digits, "position_nc": pos,
            "correspondance": "NON",
            "statut": "NON_TROUVE",
            "action": "Non trouvé dans le référentiel Article 50 — vérifier le régime TVA applicable",
            "reference": ""
        }

    conditional = (
        str(rule.get("type_regle", "")).upper() == "CONDITIONNEL"
        or str(rule.get("exclusion_ex", "")).upper() == "OUI"
    )

    if conditional:
        return {
            "nc_normalise": digits, "position_nc": pos,
            "correspondance": "OUI",
            "statut": "A_VERIFIER",
            "action": "À vérifier : la ligne Article 50 comporte une condition / mention EX",
            "reference": rule.get("source_position_article", "")
        }

    return {
        "nc_normalise": digits, "position_nc": pos,
        "correspondance": "OUI",
        "statut": "COUVERT",
        "action": "Couvert par le référentiel Article 50 duodecies",
        "reference": rule.get("source_position_article", "")
    }

@app.get("/", response_class=HTMLResponse)
def home():
    return UI_FILE.read_text(encoding="utf-8")

@app.get("/health")
def health():
    rules = load_rules()
    return {
        "status": "ok",
        "service": "article-50-tva-check",
        "referentiel": RULES_FILE.name,
        "positions": len(rules),
        "version": "2026-07-01"
    }

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), territory: str = "MQ"):
    raw = await file.read()
    filename = (file.filename or "").lower()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw), dtype=str)
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(raw), dtype=str)
        else:
            raise HTTPException(400, "Formats acceptés : CSV, XLSX, XLS")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Fichier illisible : {exc}")

    column = detect_nc_column(df)
    if not column:
        raise HTTPException(422, "Impossible d'identifier la colonne contenant le code douanier / NDP.")

    decisions = [decide(value, territory.upper()) for value in df[column]]

    out = df.copy()
    out["NC_NORMALISE"] = [d["nc_normalise"] for d in decisions]
    out["POSITION_NC"] = [d["position_nc"] for d in decisions]
    out["ARTICLE_50_CORRESPONDANCE"] = [d["correspondance"] for d in decisions]
    out["STATUT_CONTROLE"] = [d["statut"] for d in decisions]
    out["ACTION_A_FAIRE"] = [d["action"] for d in decisions]
    out["REFERENCE_ARTICLE_50"] = [d["reference"] for d in decisions]

    stats = out["STATUT_CONTROLE"].value_counts().to_dict()

    export_df = pd.DataFrame({
        "ARTICLE_ID": "",
        "REFERENCE_ARTICLE": "",
        "CODE_DOUANIER_SOURCE": df[column],
        "CODE_DOUANIER_NORMALISE": out["NC_NORMALISE"],
        "POSITION_NC": out["POSITION_NC"],
        "ARTICLE_50_CORRESPONDANCE": out["ARTICLE_50_CORRESPONDANCE"],
        "STATUT_TVA": out["STATUT_CONTROLE"],
        "ACTION": out["ACTION_A_FAIRE"],
        "REFERENCE_ARTICLE_50": out["REFERENCE_ARTICLE_50"],
        "VERSION_REFERENTIEL": "2026-07-01",
        "ARTICLE_JURIDIQUE": "50_DUODECIES"
    })

    normalized_columns = {norm_text(c): c for c in df.columns}
    for source in ["id", "article_id", "référence", "reference", "référence article"]:
        key = norm_text(source)
        if key in normalized_columns:
            target = "ARTICLE_ID" if "id" in source else "REFERENCE_ARTICLE"
            export_df[target] = df[normalized_columns[key]]
            break

    summary = pd.DataFrame([
        {"indicateur": "Articles analysés", "nombre": len(out)},
        {"indicateur": "Couverts", "nombre": int(stats.get("COUVERT", 0))},
        {"indicateur": "À vérifier", "nombre": int(stats.get("A_VERIFIER", 0))},
        {"indicateur": "Non trouvés", "nombre": int(stats.get("NON_TROUVE", 0))},
        {"indicateur": "Codes invalides", "nombre": int(stats.get("CODE_NC_INVALIDE", 0))}
    ])

    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="CONTROLE_TVA")
        summary.to_excel(writer, index=False, sheet_name="SYNTHESE")
        export_df.to_excel(writer, index=False, sheet_name="EXPORT_DATALINK")
    bio.seek(0)

    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "X-NC-Column": str(column),
            "X-Lines": str(len(out)),
            "Content-Disposition": 'attachment; filename="controle_article_50_tva.xlsx"'
        }
    )
