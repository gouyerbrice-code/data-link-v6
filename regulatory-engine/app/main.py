from pathlib import Path
import os, re, io
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse

BASE = Path(__file__).resolve().parent.parent
RULES_FILE = Path(os.getenv("RULES_FILE", BASE / "rules/50_duodecies.csv"))
UI_FILE = BASE / "ui/index.html"

app = FastAPI(title="DATALINK Regulatory Engine", version="0.1.0")

COLUMN_ALIASES = [
    "code nc","code_nc","code douane","code douanier","nomenclature",
    "nomenclature douaniere","nomenclature douanière","ndp","hs code",
    "tarif douanier","tarif douaniere","tarif douanière","customs code",
    "commodity code"
]

def norm_text(v):
    return re.sub(r"[^A-Z0-9]", "", str(v or "").upper())

def normalize_nc(v):
    s = norm_text(v)
    if not s:
        return None
    if not s.isdigit():
        return None
    if len(s) < 4:
        return None
    return s

def position_nc(code):
    code = normalize_nc(code)
    if not code:
        return None
    return f"{code[:2]}-{code[2:4]}"

def detect_nc_column(df):
    normalized = {norm_text(c): c for c in df.columns}
    for alias in COLUMN_ALIASES:
        key = norm_text(alias)
        if key in normalized:
            return normalized[key]
    # fallback: score columns by percentage of numeric-looking NC values
    best, score = None, 0
    for c in df.columns:
        vals = df[c].dropna().astype(str).head(300)
        if len(vals) == 0:
            continue
        good = sum(bool(re.fullmatch(r"\D*\d{4,10}\D*", x)) for x in vals)
        ratio = good / len(vals)
        if ratio > score:
            best, score = c, ratio
    return best if score >= 0.35 else None

def load_rules():
    if not RULES_FILE.exists():
        raise RuntimeError("Missing validated Article 50 duodecies rules file")
    rules = pd.read_csv(RULES_FILE, dtype=str).fillna("")
    required = {"position_nc","type_regle","exclusion_ex","territoire","regime","taux_tva_import"}
    missing = required - set(rules.columns)
    if missing:
        raise RuntimeError(f"Rules file missing columns: {sorted(missing)}")
    return rules

def rule_for_position(pos, territory="MQ"):
    rules = load_rules()
    r = rules[rules.position_nc.astype(str).str.upper() == str(pos).upper()]
    if r.empty:
        return None
    # Prefer the requested territory, then GP/MQ/general.
    preferred = r[r.territoire.str.contains(territory, case=False, na=False)]
    return (preferred.iloc[0] if not preferred.empty else r.iloc[0]).to_dict()

def decide(code, territory="MQ"):
    pos = position_nc(code)
    if not pos:
        return {"position_nc":"","resultat":"CODE_NC_INVALIDE","action":"Corriger ou compléter le code NC","regle":""}
    rule = rule_for_position(pos, territory)
    if not rule:
        return {"position_nc":pos,"resultat":"NON_COUVERT","action":"Appliquer le régime TVA normal / vérifier une autre base juridique","regle":""}
    typ = rule.get("type_regle","DIRECT")
    if typ in ("CONDITIONNEL","EX"):
        return {"position_nc":pos,"resultat":"CONTROLE_CONDITIONNEL","action":rule.get("condition","Vérifier les conditions de la règle"),"regle":rule.get("source_position_article",pos)}
    return {"position_nc":pos,"resultat":"FRANCHISE_DIRECTE","action":"Aucune action TVA si les autres conditions d'importation sont satisfaites","regle":rule.get("source_position_article",pos)}

@app.get("/", response_class=HTMLResponse)
def home():
    return UI_FILE.read_text(encoding="utf-8")

@app.get("/health")
def health():
    return {"status":"ok","service":"datalink-regulatory-engine","rules_file":str(RULES_FILE),"rules_loaded":RULES_FILE.exists()}

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), territory: str = "MQ"):
    raw = await file.read()
    try:
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw), dtype=str)
        elif file.filename.lower().endswith((".xlsx",".xls")):
            df = pd.read_excel(io.BytesIO(raw), dtype=str)
        else:
            raise HTTPException(400, "Formats acceptés : CSV, XLSX")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Fichier illisible : {e}")

    col = detect_nc_column(df)
    if not col:
        raise HTTPException(422, "Impossible d'identifier la colonne contenant le code NC")

    decisions = [decide(v, territory.upper()) for v in df[col]]
    out = df.copy()
    out["NC_NORMALISE"] = [normalize_nc(v) or "" for v in df[col]]
    out["POSITION_NC"] = [d["position_nc"] for d in decisions]
    out["RESULTAT_TVA"] = [d["resultat"] for d in decisions]
    out["ACTION_A_FAIRE"] = [d["action"] for d in decisions]
    out["REGLE_50_DUODECIES"] = [d["regle"] for d in decisions]

    stats = out["RESULTAT_TVA"].value_counts().to_dict()
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="CONTROLE_TVA")
        pd.DataFrame([{"indicateur":k,"nombre":v} for k,v in stats.items()]).to_excel(writer,index=False,sheet_name="SYNTHESE")
    bio.seek(0)

    headers = {
        "X-NC-Column": str(col),
        "X-Lines": str(len(out)),
        "X-Result-Summary": str(stats)
    }
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={**headers,"Content-Disposition":'attachment; filename="DATALINK_controle_tva.xlsx"'}
    )
